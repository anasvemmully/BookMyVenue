import { Router } from "express";

import venueRoutes from "./routes/venueRoutes.ts";

const router = Router();

router.use("/venues/auth", venueRoutes);

export default router;