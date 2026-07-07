import type { Response, Request } from "express";
import { error } from "node:console";
import pool from "../db.js";

export async function createEvent(req: Request, res: Response) {
  try {
    if (!req.body) {
      return res.status(400).json({
        message: "Request body is required",
      });
    }

    const {
      eventId,
      title,
      venue,
      dateTime,
      ticketPrice,
      capacity,
      seatsAvailable,
    } = req.body;

    if (
      !eventId ||
      !title ||
      !venue ||
      !dateTime ||
      !ticketPrice ||
      !capacity ||
      !seatsAvailable
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO events
      (
        eventId,
        title,
        venue,
        dateTime,
        ticketPrice,
        capacity,
        seatsAvailable
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [eventId, title, venue, dateTime, ticketPrice, capacity, seatsAvailable],
    );

    return res.status(201).json(result.rows[0]);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      message: e.message || "Failed to create event",
    });
  }
}

export async function getEvent(req: Request, res: Response) {
  const { eventId } = req.params;
  const result = await pool.query(
    `
  SELECT *
  FROM events
  WHERE eventId = $1
  `,
    [eventId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  return res.status(200).json(result.rows[0]);
}

export async function getAllEvent(req: Request, res: Response) {
  const result = await pool.query(
    `
  SELECT *
  FROM events
  `,
  );

  return res.status(200).json(result.rows);
}

export async function deleteEvent(req: Request, res: Response) {
  const { eventId } = req.params;
  try {
    const result = await pool.query(
      `
    DELETE
    FROM events
    WHERE eventId = $1
    RETURNING *
    `,
      [eventId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    return res.status(200).json({
      message: "Event deleted successfully",
    });
  } catch (e: any) {
    if (e.code === "23503") {
      return res.status(409).json({
        message: "Cannot delete event because it has existing registrations",
      });
    }
    console.error(e);
    return res.status(500).json({
      message: e.message || "Failed to delete event",
    });
  }
}

export async function UpdateEvent(req: Request, res: Response) {
  const { eventId } = req.params;
  const { title, venue, dateTime, ticketPrice, capacity, seatsAvailable } =
    req.body;
  const result = await pool.query(
    `
  UPDATE events
  SET
    title = COALESCE($2,title),
    venue = COALESCE($3,venue),
    dateTime = COALESCE($4,dateTime),
    ticketPrice = COALESCE($5,ticketPrice),
    capacity = COALESCE($6,capacity),
    seatsAvailable = COALESCE($7,seatsAvailable)
  WHERE eventId = $1
  RETURNING *;
  `,
    [eventId, title, venue, dateTime, ticketPrice, capacity, seatsAvailable],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  return res.status(200).json({
    message: "Event updated successfully",
  });
}
