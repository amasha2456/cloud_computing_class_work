import type { Response, Request } from "express";
import { error, timeStamp } from "node:console";
import pool from "../db.js";
import axios from "axios";
import { triggerLowSeatsNotification } from "../lambda.js";
import { hasEnoughSeats, isBelowThreshold } from "../seat-logic.js";

const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL;
const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL;
const SEATS_AVAILABLE_THRESHOLD = Number(process.env.SEATS_AVAILABLE_THRESHOLD);
async function getEventById(eventId: string) {
  const result = await axios.get(
    `${EVENT_SERVICE_URL}/api/v1/event/get/${eventId}`,
  );
  return result.data;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await axios.post(`${EMAIL_SERVICE_URL}/api/v1/email/send-email`, {
    to,
    subject,
    html,
  });
  return res.data;
}

async function updateEventSeats(eventId: string, seatsAvailable: number) {
  const res = await axios.put(
    `${EVENT_SERVICE_URL}/api/v1/event/update/${eventId}`,
    { seatsAvailable },
    {
      headers: {
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
      },
    },
  );
  return res.data;
}

export async function createRegistration(req: Request, res: Response) {
  try {
    if (!req.body) {
      return res.status(400).json({
        message: "Request body is required",
      });
    }

    const {
      registrationId,
      eventId,
      attendeeName,
      email,
      ticketcount,
      timeStamp,
    } = req.body;

    if (
      !registrationId ||
      !eventId ||
      !attendeeName ||
      !email ||
      !ticketcount ||
      !timeStamp
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    //call event service to check if event is valid
    let event;
    try {
      event = await getEventById(eventId);
    } catch (e: any) {
      if (e.response?.status === 404) {
        return res.status(404).json({
          message: "Event not found",
        });
      }
      throw e;
    }
    if (!hasEnoughSeats(ticketcount, event.seatsavailable)) {
      triggerLowSeatsNotification({
        eventId,
        eventTitle: event.title,
        attendeeName,
        email,
        remainingSeats: event.seatsavailable,
      }).catch((e) => {
        console.error("Failed to trigger low-seats notification", e);
      });
      return res.status(400).json({
        message: "Not enough seats available",
      });
    }
    const result = await pool.query(
      `
      INSERT INTO registration
      (
        registrationId,
        eventId,
        attendeeName,
        email,
        ticketcount,
        timeStamp
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [registrationId, eventId, attendeeName, email, ticketcount, timeStamp],
    );

    const newSeatsAvailable = event.seatsavailable - ticketcount;

    try {
      await updateEventSeats(eventId, newSeatsAvailable);
    } catch (e) {
      console.error("Failed to update event seatsAvailable", e);
    }

    if (isBelowThreshold(newSeatsAvailable, SEATS_AVAILABLE_THRESHOLD)) {
      triggerLowSeatsNotification({
        eventId,
        eventTitle: event.title,
        attendeeName,
        email,
        remainingSeats: newSeatsAvailable,
      }).catch((e) => {
        console.error("Failed to trigger low-seats notification", e);
      });
    }

    try {
      await sendEmail(
        email,
        "Registration Confirmed",
        `
        <p>Dear ${attendeeName},</p>
        <p>Your registration for <strong>${event.title}</strong> is confirmed for ${ticketcount} ticket(s).</p>
        <p>We look forward to seeing you there!</p>
        `,
      );
    } catch (e) {
      console.error("Failed to send registration confirmation email", e);
    }

    return res.status(201).json(result.rows[0]);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      message: e.message || "Failed to create a program",
    });
  }
}

export async function getRegistration(req: Request, res: Response) {
  const { registrationId } = req.params;
  const result = await pool.query(
    `
  SELECT *
  FROM registration
  WHERE registrationId = $1
  `,
    [registrationId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Registration not found",
    });
  }

  return res.status(200).json(result.rows[0]);
}

export async function getAllRegistration(req: Request, res: Response) {
  const result = await pool.query(
    `
  SELECT *
  FROM registration
  `,
  );

  return res.status(200).json(result.rows);
}

export async function updateRegistration(req: Request, res: Response) {
  const { registrationId } = req.params;
  const { eventId, attendeeName, email, ticketcount, timeStamp } = req.body;
  const result = await pool.query(
    `
  UPDATE registration
  SET
    eventId = COALESCE($2, eventId),
    attendeeName = COALESCE($3, attendeeName),
    email = COALESCE($4, email),
    ticketcount = COALESCE($5, ticketcount),
    timeStamp = COALESCE($6, timeStamp)
  WHERE registrationId = $1
  RETURNING *;
  `,
    [registrationId, eventId, attendeeName, email, ticketcount, timeStamp],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Registration not found",
    });
  }

  return res.status(200).json({
    message: "Registration updated successfully",
  });
}

export async function deleteRegistration(req: Request, res: Response) {
  const { registrationId } = req.params;
  const result = await pool.query(
    `
  DELETE 
  FROM registration
  WHERE registrationId = $1
  RETURNING *;
  `,
    [registrationId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      message: "Registration not found",
    });
  }

  return res.status(200).json({
    message: "Registration deleted successfully",
  });
}
