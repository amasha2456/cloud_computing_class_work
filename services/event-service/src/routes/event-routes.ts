import { Router } from "express";
import {
  createEvent,
  getEvent,
  getAllEvent,
  UpdateEvent,
  deleteEvent,
} from "../controller/event-controller.js";
import { requireAdmin } from "../auth-middleware.js";

const router = Router();

router.post("/event/create", requireAdmin, createEvent);
router.get("/event/get/:eventId", getEvent);
router.get("/event/allEvent", getAllEvent);
router.put("/event/update/:eventId", requireAdmin, UpdateEvent);
router.delete("/event/delete/:eventId", requireAdmin, deleteEvent);

export default router;
