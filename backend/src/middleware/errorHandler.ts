import type { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("Error Details:", err);

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;

  res.status(statusCode).json({
    error: message,
  });
}
