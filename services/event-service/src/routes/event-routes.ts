import { Router } from "express";
import {
  createEvent,
  getEvent,
  getAllEvent,
  UpdateEvent,
  deleteEvent,
} from "../controller/event-controller.js";

const router = Router();

router.post("/event/create", createEvent);
router.get("/event/get/:eventId", getEvent);
router.get("/event/allEvent", getAllEvent);
router.put("/event/update/:eventId", UpdateEvent);
router.delete("/event/delete/:eventId", deleteEvent);

export default router;
