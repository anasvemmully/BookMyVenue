import { Router } from "express";

import * as authController from "../controllers/auth.controller";
import { validateRequest } from "../middleware/validateRequest";
import { loginSchema, registerSchema } from "../validators/authSchemas";

const router = Router();

router.post("/register", validateRequest(registerSchema), authController.register);
router.post("/login", validateRequest(loginSchema), authController.login);

export default router;
