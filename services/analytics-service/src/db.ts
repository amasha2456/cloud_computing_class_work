import { createClient } from "@clickhouse/client";
import dotenv from "dotenv";

dotenv.config();

const client = createClient({
  url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  database: process.env.CLICKHOUSE_DB || "analytics",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

export default client;
