import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import programRoutes from "./routes/program-routes.js";
import { metricsMiddleware, register } from "./metrics.js";

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

app.use("/api/v1", programRoutes);

const PORT = Number(process.env.PORT) || 5002;

app.listen(PORT, () => {
  console.log(`🚀 Program Service running on port ${PORT}`);
});
