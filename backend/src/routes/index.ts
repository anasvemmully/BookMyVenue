import { Router } from "express";

import authRoutes from "./authRoutes.js";
import bookingRoutes from "./booking.route.js";
import userRoutes from "./userRoutes.js";
import venueRoutes from "./venue.route.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/venues", venueRoutes);
router.use("/bookings", bookingRoutes);

export default router;
