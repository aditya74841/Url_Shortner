import crypto from "crypto";
import { createScopedLogger } from "../utils/logger.js";

/**
 * Request Tracing & HTTP Observability Middleware
 * - Injects/Propagates X-Request-ID correlation header across requests
 * - Attaches scoped child logger req.log with correlation ID
 * - Logs HTTP request completion status, latency (ms), and client IP
 */
export const requestTracingLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();

  // Extract existing correlation ID or generate new UUID
  const requestId = req.headers["x-request-id"] || `req-${crypto.randomUUID()}`;
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);

  // Attach scoped logger to request object
  req.log = createScopedLogger({ requestId });

  // Log on request completion
  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1e6;

    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTimeMs: Number(responseTimeMs.toFixed(3)),
      ip: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      userAgent: req.headers["user-agent"] || "unknown",
    };

    if (res.statusCode >= 500) {
      req.log.error(logData, `[HTTP Server Error] ${req.method} ${req.url} HTTP ${res.statusCode} in ${responseTimeMs.toFixed(2)}ms`);
    } else if (res.statusCode >= 400) {
      req.log.warn(logData, `[HTTP Client Warning] ${req.method} ${req.url} HTTP ${res.statusCode} in ${responseTimeMs.toFixed(2)}ms`);
    } else {
      req.log.info(logData, `[HTTP Success] ${req.method} ${req.url} HTTP ${res.statusCode} in ${responseTimeMs.toFixed(2)}ms`);
    }
  });

  next();
};
