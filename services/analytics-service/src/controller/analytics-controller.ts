import type { Response, Request } from "express";
import { randomUUID } from "node:crypto";
import geoip from "geoip-lite";
import { enqueue } from "../buffer.js";
import type { WebEventRow } from "../types.js";

function toClickHouseDateTime(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  );
}

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function properties(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[str(k, 100)] = typeof v === "string" ? v.slice(0, 500) : String(v).slice(0, 500);
  }
  return out;
}

export async function collectEvents(req: Request, res: Response) {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : null;

    if (!events || events.length === 0) {
      return res.status(400).json({
        message: "events array is required",
      });
    }

    const ip = req.ip || req.socket.remoteAddress || "";
    const country = str(geoip.lookup(ip)?.country, 10);
    const serverTs = toClickHouseDateTime(new Date());

    const rows: WebEventRow[] = [];
    for (const e of events) {
      if (!e || typeof e.event_type !== "string" || !e.event_type) {
        continue;
      }

      const clientDate = new Date(e.client_ts);
      const clientTs = isNaN(clientDate.getTime())
        ? serverTs
        : toClickHouseDateTime(clientDate);

      rows.push({
        event_id: randomUUID(),
        event_type: str(e.event_type, 100),
        visitor_id: str(e.visitor_id, 100),
        session_id: str(e.session_id, 100),
        page_path: str(e.page_path, 300),
        section_id: str(e.section_id, 100),
        target: str(e.target, 200),
        label: str(e.label, 300),
        value: num(e.value),
        referrer: str(e.referrer, 500),
        utm_source: str(e.utm_source, 100),
        utm_medium: str(e.utm_medium, 100),
        utm_campaign: str(e.utm_campaign, 100),
        device_type: str(e.device_type, 20),
        browser: str(e.browser, 50),
        os: str(e.os, 50),
        country,
        properties: properties(e.properties),
        client_ts: clientTs,
        server_ts: serverTs,
      });
    }

    if (rows.length > 0) {
      enqueue(rows);
    }

    return res.status(202).json({ accepted: rows.length });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      message: e.message || "Failed to collect events",
    });
  }
}

export async function health(_req: Request, res: Response) {
  return res.status(200).json({ status: "ok" });
}
