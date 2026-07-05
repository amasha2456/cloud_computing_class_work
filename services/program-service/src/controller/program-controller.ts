import type { Response, Request } from "express";
import { error } from "node:console";
import pool from "../db.js";

export async function createProgram(req: Request, res: Response) {
  try {
    if (!req.body) {
      return res.status(400).json({
        message: "Request body is required",
      });
    }

    const { programId, sessionName, track, speakerName, dateTime, duration } =
      req.body;

    if (
      !programId ||
      !sessionName ||
      !track ||
      !speakerName ||
      !dateTime ||
      !duration
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO programs
      (
        programId,
        sessionName,
        track,
        speakerName,
        dateTime,
        duration
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [programId, sessionName, track, speakerName, dateTime, duration],
    );

    return res.status(201).json(result.rows[0]);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      message: e.message || "Failed to create a program",
    });
  }
}

export async function getProgram(req: Request, res: Response) {
  const { programId } = req.params;
  const result = await pool.query(
    `
  SELECT *
  FROM programs
  WHERE programId = $1
  `,
    [programId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Program not found",
    });
  }

  return res.status(200).json(result.rows[0]);
}

export async function getAllProgram(req: Request, res: Response) {
  const result = await pool.query(
    `
  SELECT *
  FROM programs
  `,
  );

  return res.status(200).json(result.rows);
}

export async function deleteProgram(req: Request, res: Response) {
  const { programId } = req.params;
  const result = await pool.query(
    `
  DELETE 
  FROM programs
  WHERE programId = $1
  RETURNING *;
  `,
    [programId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Program not found",
    });
  }

  return res.status(200).json({
    message: "Program deleted successfully",
  });
}

export async function updateProgramDetails(req: Request, res: Response) {
  const { programId } = req.params;
  const { sessionName, track, speakerName, dateTime, duration } = req.body;
  const result = await pool.query(
    `
  UPDATE programs
  SET
    sessionName = COALESCE($2, sessionName),
    track = COALESCE($3, track),
    speakerName = COALESCE($4, speakerName),
    dateTime = COALESCE($5, dateTime),
    duration = COALESCE($6, duration)
  WHERE programId = $1
  RETURNING *;
  `,
    [programId, sessionName, track, speakerName, dateTime, duration],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Program not found",
    });
  }

  return res.status(200).json({
    message: "Program updated successfully",
  });
}
