import { Router } from "express";

import * as userController from "../controllers/userController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { updateProfileSchema } from "../validators/userSchemas.js";

import type { Handler } from "express";

const router = Router();

router.get("/me", authenticate, userController.getMe as Handler);
router.patch(
  "/me",
  authenticate,
  validateRequest(updateProfileSchema),
  userController.updateProfile as Handler
);

export default router;
