import * as userService from "../services/user.service";

import type { UpdateProfileInput } from "../validators/userSchemas";
import type { NextFunction, Request, Response } from "express";

// TODO: ned to move to seperate file
type UserRequest = Request & {
  user: {
    id: number;
    email: string;
    role: string;
  };
};
// TODO: ned to move to seperate file

export async function getMe(req: UserRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.getUserProfile(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  req: UserRequest & { body: UpdateProfileInput },
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await userService.updateUserProfile(req.user.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
