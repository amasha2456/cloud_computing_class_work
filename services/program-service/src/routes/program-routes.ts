import { Router } from "express";
import {
  createProgram,
  getProgram,
  getAllProgram,
  updateProgramDetails,
  deleteProgram,
} from "../controller/program-controller.js";
import { requireAdmin } from "../auth-middleware.js";

const router = Router();

router.post("/program/createProgram", requireAdmin, createProgram);
router.get("/program/getProgram/:programId", getProgram);
router.get("/program/getAllProgram", getAllProgram);
router.put("/program/updateProgramDetails/:programId", requireAdmin, updateProgramDetails);
router.delete("/program/deleteProgram/:programId", requireAdmin, deleteProgram);

export default router;
