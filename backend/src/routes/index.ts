import { Router } from "express";

import bookingRoutes from "./bookingRoutes.js";
import venueRoutes from "./venueRoutes.js";

const router = Router();

router.use("/venues", venueRoutes);
router.use("/bookings", bookingRoutes);

export default router;
