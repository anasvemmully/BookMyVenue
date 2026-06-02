import { Router } from "express";

import bookingRoutes from "./booking.route.js";
import venueRoutes from "./venue.route.js";

const router = Router();

router.use("/venues", venueRoutes);
router.use("/bookings", bookingRoutes);

export default router;
