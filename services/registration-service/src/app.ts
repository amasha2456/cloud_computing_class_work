import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import registrationRoutes from "./routes/registration-routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", registrationRoutes);

const PORT = Number(process.env.PORT) || 5003;

app.listen(PORT, () => {
  console.log(`🚀 Registration Service running on port ${PORT}`);
});
