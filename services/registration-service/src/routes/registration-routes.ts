import { Router } from "express";
import {
  createRegistration,
  getRegistration,
  getAllRegistration,
  updateRegistration,
  deleteRegistration,
} from "../controller/registration-controller.js";
import { requireAdmin } from "../auth-middleware.js";

const router = Router();

router.post("/registration/createRegistration", createRegistration);
router.get(
  "/registration/getRegistration/:registrationId",
  requireAdmin,
  getRegistration,
);
router.get(
  "/registration/getAllRegistration",
  requireAdmin,
  getAllRegistration,
);
router.put(
  "/registration/updateRegistration/:registrationId",
  requireAdmin,
  updateRegistration,
);
router.delete(
  "/registration/deleteRegistration/:registrationId",
  requireAdmin,
  deleteRegistration,
);

export default router;
