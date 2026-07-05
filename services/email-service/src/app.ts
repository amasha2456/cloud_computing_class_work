import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { handler } from "./send.email";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/v1/email/send-email", handler);

const PORT = Number(process.env.PORT) || 5004;

app.listen(PORT, () => {
  console.log(`🚀 Event Service running on port ${PORT}`);
});
