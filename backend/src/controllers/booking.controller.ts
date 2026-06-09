import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

import { prisma } from "../config/db";

import type { Request, Response, NextFunction } from "express";

type CreateBookingInput = {
  userId: string;
  venueId: string;
  availabilityId: string;
  ticketTierId?: string;
  numberOfTickets: number;
  notes?: string;
};

export const getUserBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id },
      include: {
        venue: true,
        availability: true,
        payments: true,
        tickets: { include: { ticketTier: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

export const getOwnerBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { venue: { ownerId: req.user!.id } },
      include: {
        venue: true,
        availability: true,
        payments: true,
        tickets: { include: { ticketTier: true } },
        user: { select: { id: true, email: true, profile: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: CreateBookingInput = {
      userId: req.user!.id,
      venueId: req.body.venueId,
      availabilityId: req.body.availabilityId,
      ticketTierId: req.body.ticketTierId,
      numberOfTickets: Number(req.body.numberOfTickets),
      notes: req.body.notes,
    };

    const venue = await prisma.venue.findUnique({ where: { id: data.venueId } });
    if (!venue) throw new Error("Venue not found");
    if (venue.status !== "APPROVED") throw new Error("Venue is not active/approved");

    const availability = await prisma.venueAvailability.findUnique({
      where: { id: data.availabilityId },
      include: { ticketTiers: true },
    });
    if (!availability) throw new Error("Availability slot not found");

    const slotStart = new Date(availability.startTime);
    const slotEnd = new Date(availability.endTime);
    const bufferMs = venue.cleanUpBufferMinutes * 60 * 1000;

    const existingBookings = await prisma.booking.findMany({
      where: { venueId: data.venueId, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
      include: { availability: true },
    });

    for (const existing of existingBookings) {
      const existingStart = new Date(existing.availability.startTime);
      const existingEnd = new Date(existing.availability.endTime);

      if (slotStart < existingEnd && slotEnd > existingStart) {
        throw new Error("Booking overlaps with an existing reservation slot");
      }

      if (slotStart >= existingEnd && slotStart.getTime() - existingEnd.getTime() < bufferMs) {
        throw new Error(
          `Handover buffer violation. At least ${venue.cleanUpBufferMinutes} minutes cleanup time is required after the slot ending at ${existingEnd.toLocaleTimeString()}.`
        );
      }

      if (slotEnd <= existingStart && existingStart.getTime() - slotEnd.getTime() < bufferMs) {
        throw new Error(
          `Handover buffer violation. At least ${venue.cleanUpBufferMinutes} minutes cleanup time is required before the slot starting at ${existingStart.toLocaleTimeString()}.`
        );
      }
    }

    let ticketPrice: Prisma.Decimal = availability.pricePerTicket;

    if (data.ticketTierId) {
      const tier = availability.ticketTiers.find((t) => t.id === data.ticketTierId);
      if (!tier) throw new Error("Ticket tier not found in this availability slot");
      if (tier.capacity - tier.bookedCount < data.numberOfTickets) {
        throw new Error("Selected ticket tier is sold out / doesn't have enough seats");
      }
      ticketPrice = tier.price;
    } else {
      if (availability.totalCapacity - availability.bookedCapacity < data.numberOfTickets) {
        throw new Error("Availability slot is fully booked / sold out");
      }
    }

    const subtotal = ticketPrice.mul(data.numberOfTickets);
    const taxAmount = subtotal.mul(0.18);
    const totalAmount = subtotal.add(taxAmount);
    const bookingReference = `BMV-${uuidv4().substring(0, 8).toUpperCase()}`;

    const booking = await prisma.booking.create({
      data: {
        userId: data.userId,
        venueId: data.venueId,
        availabilityId: data.availabilityId,
        bookingReference,
        numberOfTickets: data.numberOfTickets,
        subtotal,
        totalAmount,
        bookingStatus: "PENDING",
        paymentStatus: "PENDING",
        amountPaid: new Prisma.Decimal(0),
      },
    });

    await prisma.bookingTicket.createMany({
      data: Array.from({ length: data.numberOfTickets }).map((_, i) => ({
        bookingId: booking.id,
        ticketTierId: data.ticketTierId,
        ticketNumber: `${bookingReference}-TK-${i + 1}`,
      })),
    });

    if (data.ticketTierId) {
      await prisma.ticketTier.update({
        where: { id: data.ticketTierId },
        data: { bookedCount: { increment: data.numberOfTickets } },
      });
    }

    await prisma.venueAvailability.update({
      where: { id: data.availabilityId },
      data: { bookedCapacity: { increment: data.numberOfTickets } },
    });

    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
};

export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (status !== "CONFIRMED" && status !== "CANCELLED") {
      return res.status(400).json({ error: "Invalid status code" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
      include: { venue: true, tickets: true },
    });

    if (!booking) throw new Error("Booking not found");
    if (booking.venue.ownerId !== req.user!.id)
      throw new Error("Unauthorized to approve/decline this request");
    if (booking.bookingStatus !== "PENDING" && status === "CONFIRMED") {
      throw new Error("Only pending bookings can be confirmed");
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id as string },
      data: { bookingStatus: status },
    });

    if (status === "CANCELLED") {
      const ticketTierId = booking.tickets[0]?.ticketTierId;
      if (ticketTierId) {
        await prisma.ticketTier.update({
          where: { id: ticketTierId },
          data: { bookedCount: { decrement: booking.numberOfTickets } },
        });
      }
      await prisma.venueAvailability.update({
        where: { id: booking.availabilityId },
        data: { bookedCapacity: { decrement: booking.numberOfTickets } },
      });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const pay = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId, amount, paymentGateway, paymentMethod, transactionId } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { venue: true },
    });
    if (!booking) throw new Error("Booking not found");

    const isFullPayment = booking.totalAmount.equals(amount) || amount === 0;
    if (!isFullPayment && !booking.venue.advancePaymentAllowed) {
      throw new Error("This venue does not allow partial/advance payments. You must pay in full.");
    }

    if (!booking.totalAmount.equals(amount) && booking.venue.advancePaymentAllowed) {
      const minPercentage = booking.venue.minDepositPercentage;
      const minRequired = booking.totalAmount.mul(minPercentage.div(100));
      if (new Prisma.Decimal(amount).lt(minRequired)) {
        throw new Error(
          `The minimum deposit required is ${minRequired} INR (${minPercentage}% of total).`
        );
      }
    }

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        paymentGateway,
        paymentMethod,
        transactionId: transactionId || `TXN-${uuidv4().substring(0, 8).toUpperCase()}`,
        amount: new Prisma.Decimal(amount),
        paymentStatus: "COMPLETED",
        paidAt: new Date(),
      },
    });

    const newAmountPaid = booking.amountPaid.add(amount);
    const paymentStatus = newAmountPaid.gte(booking.totalAmount) ? "COMPLETED" : "PROCESSING";

    await prisma.booking.update({
      where: { id: bookingId },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });

    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
};

export const getAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { ownerId: req.user!.id },
      include: { availability: true },
    });

    const venueIds = venues.map((v) => v.id);

    const bookings = await prisma.booking.findMany({
      where: { venueId: { in: venueIds } },
    });

    const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.amountPaid), 0);
    const confirmedCount = bookings.filter((b) => b.bookingStatus === "CONFIRMED").length;
    const pendingCount = bookings.filter((b) => b.bookingStatus === "PENDING").length;

    let totalCapacity = 0;
    let bookedCapacity = 0;
    for (const venue of venues) {
      for (const slot of venue.availability) {
        totalCapacity += slot.totalCapacity;
        bookedCapacity += slot.bookedCapacity;
      }
    }

    const occupancyRate = totalCapacity > 0 ? (bookedCapacity / totalCapacity) * 100 : 0.0;

    res.json({
      totalRevenue,
      totalBookingsCount: bookings.length,
      confirmedBookingsCount: confirmedCount,
      pendingBookingsCount: pendingCount,
      occupancyRate: Number(occupancyRate.toFixed(2)),
    });
  } catch (error) {
    next(error);
  }
};

export const bookingController = {
  getUserBookings,
  getOwnerBookings,
  create,
  updateStatus,
  pay,
  getAnalytics,
};
