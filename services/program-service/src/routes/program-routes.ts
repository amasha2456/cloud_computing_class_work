import { Router } from "express";
import {
  createProgram,
  getProgram,
  getAllProgram,
  updateProgramDetails,
  deleteProgram,
} from "../controller/program-controller.js";

const router = Router();

router.post("/program/createProgram", createProgram);
router.get("/program/getProgram/:programId", getProgram);
router.get("/program/getAllProgram", getAllProgram);
router.put("/program/updateProgramDetails/:programId", updateProgramDetails);
router.delete("/program/deleteProgram/:programId", deleteProgram);

export default router;
