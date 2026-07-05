import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import eventRoutes from "./routes/event-routes.js";

const app = express();

app.use(cors());
app.use(express.json());

// app.use("/events", eventRoutes);

app.get("/hello", (_, res) => {
  res.status(201).send("hello");
});
app.use("/api", eventRoutes);

const PORT = Number(process.env.PORT) || 5001;

app.listen(PORT, () => {
  console.log(`🚀 Event Service running on port ${PORT}`);
});
