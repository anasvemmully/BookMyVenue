import { Router } from "express";
import { z } from "zod";

import { bookingController } from "../controllers/booking.controller";
import { authenticate } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validateRequest";

const createBookingSchema = z.object({
  venueId: z.string().uuid(),
  availabilityId: z.string().uuid(),
  ticketTierId: z.string().uuid().optional(),
  numberOfTickets: z.number().min(1),
  notes: z.string().optional(),
});

const paySchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().min(0.01),
  paymentGateway: z.enum(["RAZORPAY", "STRIPE", "PAYPAL", "CASH"]),
  paymentMethod: z.enum(["CREDIT_CARD", "DEBIT_CARD", "UPI", "NET_BANKING", "WALLET", "CASH"]),
  transactionId: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED"]),
});

const router = Router();

router.use(authenticate);

// Customer bookings
router.get("/user", bookingController.getUserBookings);
router.post("/", validateRequest(createBookingSchema), bookingController.create);
router.post("/pay", validateRequest(paySchema), bookingController.pay);

// Owner bookings
router.get("/owner", bookingController.getOwnerBookings);
router.patch("/:id/status", validateRequest(statusSchema), bookingController.updateStatus);
router.get("/analytics", bookingController.getAnalytics);

export default router;
