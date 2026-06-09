import { Router } from "express";

import authRoutes from "./auth.route";
import bookingRoutes from "./booking.route";
import userRoutes from "./user.route";
import venueRoutes from "./venue.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/venues", venueRoutes);
router.use("/bookings", bookingRoutes);

export default router;
