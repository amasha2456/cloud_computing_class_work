import { Router } from "express";
import {
  createRegistration,
  getRegistration,
  getAllRegistration,
  updateRegistration,
  deleteRegistration,
} from "../controller/registration-controller.js";

const router = Router();

router.post("/registration/createRegistration", createRegistration);
router.get("/registration/getRegistration/:registrationId", getRegistration);
router.get("/registration/getAllRegistration", getAllRegistration);
router.put(
  "/registration/updateRegistration/:registrationId",
  updateRegistration,
);
router.delete(
  "/registration/deleteRegistration/:registrationId",
  deleteRegistration,
);

export default router;
