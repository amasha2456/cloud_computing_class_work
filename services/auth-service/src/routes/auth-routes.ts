import { Router } from "express";
import { login } from "../controller/auth-controller.js";

const router = Router();

router.post("/auth/login", login);

export default router;
