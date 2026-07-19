import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import registrationRoutes from "./routes/registration-routes.js";
import { metricsMiddleware, register } from "./metrics.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.use("/api/v1", registrationRoutes);

const PORT = Number(process.env.PORT) || 5003;

app.listen(PORT, () => {
  console.log(`🚀 Registration Service running on port ${PORT}`);
});
