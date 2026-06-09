import { Router } from "express";

import * as userController from "../controllers/user.controller";
import { authenticate } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validateRequest";
import { updateProfileSchema } from "../validators/userSchemas";

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
