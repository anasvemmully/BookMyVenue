import { bookingService } from "../services/bookingService.js";

import type { Request, Response, NextFunction } from "express";

export const getUserBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await bookingService.getUserBookings(req.user!.userId);
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

export const getOwnerBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await bookingService.getOwnerBookings(req.user!.userId);
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.createBooking({
      userId: req.user!.userId,
      venueId: req.body.venueId,
      availabilityId: req.body.availabilityId,
      ticketTierId: req.body.ticketTierId,
      numberOfTickets: Number(req.body.numberOfTickets),
      notes: req.body.notes,
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
    const booking = await bookingService.updateBookingStatus(
      req.params.id as string,
      req.user!.userId,
      status
    );
    res.json(booking);
  } catch (error) {
    next(error);
  }
};

export const pay = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId, amount, paymentGateway, paymentMethod, transactionId } = req.body;
    const payment = await bookingService.receivePayment(
      bookingId,
      Number(amount),
      paymentGateway,
      paymentMethod,
      transactionId
    );
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
};

export const getAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analytics = await bookingService.getOwnerAnalytics(req.user!.userId);
    res.json(analytics);
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
