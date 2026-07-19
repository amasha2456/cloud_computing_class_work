import { Router } from "express";
import { collectEvents, health } from "../controller/analytics-controller.js";

const router = Router();

router.post("/collect", collectEvents);
router.get("/health", health);

export default router;
