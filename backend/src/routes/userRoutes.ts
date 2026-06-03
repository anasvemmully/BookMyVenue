import { Router } from "express";

import * as userController from "../controllers/userController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { updateProfileSchema } from "../validators/userSchemas.js";

const router = Router();

router.get("/me", authenticate, userController.getMe);
router.patch(
  "/me",
  authenticate,
  validateRequest(updateProfileSchema),
  userController.updateProfile
);

export default router;
