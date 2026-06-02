import jwt from "jsonwebtoken";

import type { Request, Response, NextFunction } from "express";

const secret = process.env.JWT_SECRET || "default-secret-change-me";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : authHeader;

  if (!token) {
    return res.status(401).json({ success: false, error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: string;
    };

    req.user = decoded;
    next();
  } catch (_error) {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}
