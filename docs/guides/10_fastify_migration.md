# 🚀 Fastify Framework Migration & Performance Guide

## 📌 Overview
This document details the migration of the URL Shortener backend framework from **Express.js** to **Fastify**. 

Fastify was chosen to provide low-overhead HTTP routing, native Pino structured logging integration, and maximum requests-per-second (RPS) throughput.

---

## ⚡ Performance Comparison (Express vs Fastify)

Both frameworks were benchmarked using **Autocannon** (`50` concurrent virtual connections over `5` seconds) under identical system conditions:

| Metric | Express.js Engine | Fastify Engine | Improvement |
| :--- | :--- | :--- | :--- |
| **Total Requests Fired** | 1,727 requests | **2,441 requests** | **+41.4% More Capacity** |
| **Throughput Rate (RPS)** | 345 req/sec | **488 req/sec** | **+41.4% Faster Ingestion** |
| **Response Latency (p99)** | 228 ms | **169 ms** | **26% Lower Latency** |
| **Server Error Rate (5xx)** | 0 (0%) | **0 (0%)** | 100% Reliability |
| **Click Accounting Accuracy** | 100% Accurate | **100% Accurate** | Data Integrity Preserved |

---

## 🛠️ Key Architectural Changes Introduced

### 1. Engine Initialization (`src/app.js`)
Fastify engine instance configured with native Pino logger and correlation ID propagation:

```javascript
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import routes from "./routes/index.js";
import { logger } from "./utils/logger.js";

export const buildApp = () => {
  const fastify = Fastify({
    loggerInstance: logger,
    genReqId: (req) => req.headers["x-request-id"] || `req-${uuidv4()}`,
    requestIdHeader: "x-request-id",
  });

  fastify.register(formbody);
  fastify.register(routes);

  return fastify;
};
```

---

### 2. Fastify Controller Signatures (`(request, reply)`)
Express `(req, res, next)` signatures were refactored to Fastify `(request, reply)`:

```javascript
export const redirectToFullUrl = async (request, reply) => {
  const { shortUrl } = request.params;
  const urlDoc = await UrlService.getByShortCode(shortUrl);

  ClickQueueService.pushClickEvent({
    shortCode: shortUrl,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
    requestId: request.id,
  });

  return reply.redirect(urlDoc.full, 302);
};
```

---

### 3. Fastify Route Plugins (`src/routes/`)
Routes are registered as modular Fastify async plugin functions:

```javascript
export default async function apiUrlRoutes(fastify, options) {
  fastify.post("/", { preHandler: [strictWriteRateLimiter] }, urlController.createUrl);
  fastify.get("/", urlController.getAllUrls);
  fastify.get("/:shortUrl/stats", urlController.getUrlStats);
}
```

---

## 🧪 Verification Commands

```bash
# 1. Observability & Tracing Test
npm run test-observability

# 2. Multi-Process Cluster Test
npm run test-cluster

# 3. High-Concurrency Stress Test
npm run test-chaos
```
