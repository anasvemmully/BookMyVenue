import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

import { prisma } from "../config/db";

type CreateBookingInput = {
  userId: string;
  venueId: string;
  availabilityId: string;
  ticketTierId?: string;
  numberOfTickets: number;
  notes?: string;
};

export async function getUserBookings(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    include: {
      venue: true,
      availability: true,
      payments: true,
      tickets: { include: { ticketTier: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return bookings;
}

export async function getOwnerBookings(ownerId: string) {
  const bookings = await prisma.booking.findMany({
    where: { venue: { ownerId } },
    include: {
      venue: true,
      availability: true,
      payments: true,
      tickets: { include: { ticketTier: true } },
      user: { select: { id: true, email: true, profile: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return bookings;
}

export async function createBooking(data: CreateBookingInput) {
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
    where: {
      venueId: data.venueId,
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { availability: true },
  });

  for (const existing of existingBookings) {
    const existingStart = new Date(existing.availability.startTime);
    const existingEnd = new Date(existing.availability.endTime);

    const overlapStart = slotStart.getTime() < existingEnd.getTime();
    const overlapEnd = slotEnd.getTime() > existingStart.getTime();
    if (overlapStart && overlapEnd) {
      throw new Error("Booking overlaps with an existing reservation slot");
    }

    if (slotStart.getTime() >= existingEnd.getTime()) {
      const gap = slotStart.getTime() - existingEnd.getTime();
      if (gap < bufferMs) {
        throw new Error(
          `Handover buffer violation. At least ${venue.cleanUpBufferMinutes} minutes cleanup time is required after the slot ending at ${existingEnd.toLocaleTimeString()}.`
        );
      }
    }

    if (slotEnd.getTime() <= existingStart.getTime()) {
      const gap = existingStart.getTime() - slotEnd.getTime();
      if (gap < bufferMs) {
        throw new Error(
          `Handover buffer violation. At least ${venue.cleanUpBufferMinutes} minutes cleanup time is required before the slot starting at ${existingStart.toLocaleTimeString()}.`
        );
      }
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

  return booking;
}

export async function updateBookingStatus(
  bookingId: string,
  ownerId: string,
  status: "CONFIRMED" | "CANCELLED"
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { venue: true, tickets: true },
  });

  if (!booking) throw new Error("Booking not found");
  if (booking.venue.ownerId !== ownerId)
    throw new Error("Unauthorized to approve/decline this request");
  if (booking.bookingStatus !== "PENDING" && status === "CONFIRMED") {
    throw new Error("Only pending bookings can be confirmed");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
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

  return updated;
}

export async function receivePayment(
  bookingId: string,
  amount: number,
  paymentGateway: "RAZORPAY" | "STRIPE" | "PAYPAL" | "CASH",
  paymentMethod: "CREDIT_CARD" | "DEBIT_CARD" | "UPI" | "NET_BANKING" | "WALLET" | "CASH",
  transactionId?: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { venue: true },
  });

  if (!booking) throw new Error("Booking not found");

  const isOwnerOrFullPayment = booking.totalAmount.equals(amount) || amount === 0;
  if (!isOwnerOrFullPayment && !booking.venue.advancePaymentAllowed) {
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
    data: {
      amountPaid: newAmountPaid,
      paymentStatus,
    },
  });

  return payment;
}

export async function getOwnerAnalytics(ownerId: string) {
  const venues = await prisma.venue.findMany({
    where: { ownerId },
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

  return {
    totalRevenue,
    totalBookingsCount: bookings.length,
    confirmedBookingsCount: confirmedCount,
    pendingBookingsCount: pendingCount,
    occupancyRate: Number(occupancyRate.toFixed(2)),
  };
}

export const bookingService = {
  getUserBookings,
  getOwnerBookings,
  createBooking,
  updateBookingStatus,
  receivePayment,
  getOwnerAnalytics,
};
