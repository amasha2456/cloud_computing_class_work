import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        message: "username and password are required",
      });
    }

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminUsername || !adminPasswordHash || !jwtSecret) {
      console.error("auth-service is missing required env configuration");
      return res.status(500).json({ message: "Server misconfigured" });
    }

    if (username !== adminUsername) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, adminPasswordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ sub: username, role: "admin" }, jwtSecret, {
      expiresIn: "8h",
    });

    return res.status(200).json({ token });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      message: e.message || "Failed to log in",
    });
  }
}

export async function health(_req: Request, res: Response) {
  return res.status(200).json({ status: "ok" });
}
