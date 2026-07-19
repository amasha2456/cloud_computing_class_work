import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);

  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
