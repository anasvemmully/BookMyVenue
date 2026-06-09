import { Router } from "express";
import { z } from "zod";

import { venueController } from "../controllers/venue.controller";
import { authenticate } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validateRequest";

const submitVenueSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  venueType: z.enum(["OFFLINE", "ONLINE", "HYBRID"]).optional(),
  indoorOutdoor: z.enum(["INDOOR", "OUTDOOR", "BOTH"]).optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  categoryId: z.string().optional(),
  cleanUpBufferMinutes: z.number().min(0).optional(),
  advancePaymentAllowed: z.boolean().optional(),
  minDepositPercentage: z.number().min(0).max(100).optional(),
  bannerImageUrl: z.string().optional(),
});

const availabilitySchema = z.object({
  availableDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  totalCapacity: z.number().min(1),
  pricePerTicket: z.number().min(0),
  ticketTiers: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.number().min(0),
        capacity: z.number().min(1),
      })
    )
    .optional(),
});

const tiersSchema = z.object({
  tiers: z.array(
    z.object({
      name: z.string().min(1),
      price: z.number().min(0),
      capacity: z.number().min(1),
    })
  ),
});

const router = Router();

router.get("/", venueController.getAll);
router.get("/:id", venueController.getById);

router.post("/", authenticate, validateRequest(submitVenueSchema), venueController.create);
router.put("/:id", authenticate, validateRequest(submitVenueSchema), venueController.edit);
router.patch("/:id/approve", authenticate, venueController.approve);
router.post(
  "/:id/availability",
  authenticate,
  validateRequest(availabilitySchema),
  venueController.addAvailabilitySlot
);
router.post(
  "/availability/:id/tiers",
  authenticate,
  validateRequest(tiersSchema),
  venueController.setTicketTiers
);

export default router;
