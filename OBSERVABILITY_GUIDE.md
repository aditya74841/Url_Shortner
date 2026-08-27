# 📊 Observability, Structured Logging & Request Tracing Guide

## 📌 Overview
This document details **Stage 12: Observability, Structured Logging & Request Tracing** implemented in this URL Shortener backend. It explains Pino structured JSON logging, Correlation IDs (`X-Request-ID`), HTTP server telemetry, and end-to-end event tracing across asynchronous queues and background workers.

---

## 🎯 Architecture

```text
Incoming HTTP Request (Client)
      │  (Header: X-Request-ID: req-abc1234)
      ▼
[ Express Router ] ──► (requestTracingLogger middleware injects X-Request-ID)
      │
      ├─► Emit Pino JSON Log: { requestId: "req-abc1234", method: "GET", url: "/MUUWXLd", responseTimeMs: 0.85 }
      │
      ▼ (Push event to Redis queue with requestId)
[ Redis Queue ]
      │
      ▼ (Background Worker pops event)
[ Analytics Worker ] ──► Emit Pino JSON Log: { requestId: "req-abc1234", batch: 1, action: "bulkWrite_success" }
```

---

## 🛠️ Code Implementation

### 1. High-Performance Pino Logger (`src/utils/logger.js`)
Configured with non-blocking structured JSON output in production and readable colored output in development:

```javascript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { pid: process.pid, env: process.env.NODE_ENV },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
});
```

---

### 2. Request Tracing Middleware (`src/middlewares/logger.middleware.js`)
Picks up incoming `X-Request-ID` or generates a unique UUID (`req-xxxx`). Attaches a scoped `req.log` child logger and injects `X-Request-ID` in HTTP response headers:

```javascript
export const requestTracingLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const requestId = req.headers["x-request-id"] || `req-${crypto.randomUUID()}`;
  
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);
  req.log = createScopedLogger({ requestId });

  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1e6;

    req.log.info({
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTimeMs: Number(responseTimeMs.toFixed(3)),
    }, `[HTTP Success] ${req.method} ${req.url} HTTP ${res.statusCode} in ${responseTimeMs.toFixed(2)}ms`);
  });

  next();
};
```

---

### 3. Event Queue & Background Worker Tracing (`src/workers/analytics.worker.js`)
Every click event payload queued in Redis carries the `requestId`. When `AnalyticsWorker` processes the batch, it logs with the exact `requestId` correlation context!

---

## 🧪 Verification Benchmark (`npm run test-observability`)

```bash
npm run test-observability
```

### Output:
```text
======================================================
📊 STAGE 12: OBSERVABILITY & REQUEST TRACING BENCHMARK
======================================================

[1] Created Test Short URL: 4jn8Sh6

[2] Sending HTTP GET /4jn8Sh6 with custom header 'X-Request-ID: req-trace-correlation-1787817295784'...
    - Response HTTP Status : 302
    - Returned X-Request-ID: req-trace-correlation-1787817295784

[3] Inspecting Redis Queue for propagated Correlation ID...
[2026-08-27 13:24:56.059] INFO: [HTTP Success] GET /4jn8Sh6 HTTP 302 in 256.22ms
    requestId: "req-trace-correlation-1787817295784"
    method: "GET"
    url: "/4jn8Sh6"
    statusCode: 302
    responseTimeMs: 256.216

======================================================
🚀 OBSERVABILITY & REQUEST TRACING REPORT
======================================================
- Request ID Propagation   : PASS ✅
- Queue Correlation Tracing: PASS ✅
- Structured Log Emission  : PASS ✅ (Pino JSON formatted)
- Worker Batch Ingestion   : 1 Unique Events Processed
======================================================
✅ STAGE 12 OBSERVABILITY & REQUEST TRACING VERIFIED 100% SUCCESSFUL!
```
