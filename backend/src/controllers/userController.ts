import * as userService from "../services/userService.js";

import type { UpdateProfileInput } from "../validators/userSchemas.js";
import type { NextFunction, Request, Response } from "express";

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.getUserProfile(req.user!.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await userService.updateUserProfile(req.user!.id, req.body as UpdateProfileInput);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
