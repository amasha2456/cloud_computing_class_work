import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import programRoutes from "./routes/program-routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1", programRoutes);

const PORT = Number(process.env.PORT) || 5002;

app.listen(PORT, () => {
  console.log(`🚀 Program Service running on port ${PORT}`);
});
