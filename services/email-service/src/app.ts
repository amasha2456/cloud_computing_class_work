import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { handler } from "./send.email";
import { metricsMiddleware, register } from "./metrics";

const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:8080").split(",") }));
app.use(express.json());
app.use(metricsMiddleware);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.post("/api/v1/email/send-email", handler);

const PORT = Number(process.env.PORT) || 5004;

app.listen(PORT, () => {
  console.log(`🚀 Event Service running on port ${PORT}`);
});
