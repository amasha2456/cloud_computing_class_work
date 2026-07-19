import client from "prom-client";
import type { Request, Response, NextFunction } from "express";

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
}
