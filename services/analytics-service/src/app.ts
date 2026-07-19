import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import analyticsRoutes from "./routes/analytics-routes.js";
import { startFlushLoop } from "./buffer.js";
import { metricsMiddleware, register } from "./metrics.js";

const app = express();

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1", analyticsRoutes);

startFlushLoop();

const PORT = Number(process.env.PORT) || 5005;

app.listen(PORT, () => {
  console.log(`🚀 Analytics Service running on port ${PORT}`);
});
