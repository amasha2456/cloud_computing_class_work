import dotenv from "dotenv";
import client from "./db.js";
import type { WebEventRow } from "./types.js";

dotenv.config();

const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS) || 5000;
const FLUSH_MAX_BUFFER = Number(process.env.FLUSH_MAX_BUFFER) || 500;

let buffer: WebEventRow[] = [];
let flushing = false;

export function enqueue(rows: WebEventRow[]) {
  buffer.push(...rows);
  if (buffer.length >= FLUSH_MAX_BUFFER) {
    void flush();
  }
}

export async function flush() {
  if (flushing || buffer.length === 0) {
    return;
  }

  flushing = true;
  const batch = buffer;
  buffer = [];

  try {
    await client.insert({
      table: "web_events",
      values: batch,
      format: "JSONEachRow",
    });
  } catch (e) {
    console.error(`Failed to flush ${batch.length} analytics events`, e);
  } finally {
    flushing = false;
  }
}

export function startFlushLoop() {
  setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
}
