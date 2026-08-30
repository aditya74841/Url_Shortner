# 🌐 Multiple API Servers & Horizontal Scaling Guide

## 📌 Overview
This document explains **Stage 11: Multiple API Servers & Horizontal Scaling** implemented in this URL Shortener project. It details stateless architecture principles, Node.js Multi-Process Clustering (`node:cluster`), PM2 multi-instance process management, `/health` liveness/readiness probes, and reverse proxy load balancing.

---

## 🎯 What is Horizontal Scaling?

### ❌ Vertical Scaling (Scale Up)
Upgrading a single server to larger hardware (e.g. 4 CPU cores -> 32 CPU cores).
- **Disadvantages**: Expensive, single point of failure (if server crashes, entire service dies).

---

### ✅ Horizontal Scaling (Scale Out - Stage 11)
Deploying **N identical, stateless API server nodes** behind a Load Balancer / Reverse Proxy:

```text
                                Client Request
                                      │
                                      ▼
                             Nginx / Load Balancer
                           /          |          \
                          ▼           ▼           ▼
                      Node #1      Node #2     Node #3  (Stateless API Instances)
                          \           |           /
                           └──────────┼───────────┘
                                      ▼
                                Upstash Redis
                                      │
                                      ▼
                                   MongoDB
```

- **Stateless Architecture Rule**: No API node holds in-memory session data or request state. All session state, rate limit tokens, cache keys, and analytics event queues reside in centralized **Redis & MongoDB**.
- **Result**: Any client request can land on **Node #1, Node #2, or Node #3** and yield 100% identical performance and behavior!

---

## 🛠️ Code Base Implementation

### 1. Liveness & Readiness Probes (`src/controllers/health.controller.js`)

Provides system telemetry for Kubernetes / Docker / AWS load balancers:

```javascript
export const getHealthStatus = catchAsync(async (req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  const isRedisConnected = getIsRedisConnected();
  const queueLength = await ClickQueueService.getQueueLength();

  const isHealthy = isMongoConnected && isRedisConnected;
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    services: {
      mongodb: { status: isMongoConnected ? "connected" : "disconnected" },
      redis: { status: isRedisConnected ? "connected" : "disconnected" },
      queue: { pendingEvents: queueLength },
    },
  });
});
```

---

### 2. Native Multi-Process Cluster Manager (`src/cluster.js`)

Forks worker processes across all available CPU cores and automatically spawns replacement processes if any worker crashes:

```javascript
import cluster from "node:cluster";
import os from "node:os";

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.warn(`Worker PID ${worker.process.pid} died. Spawning replacement...`);
    cluster.fork(); // Auto-healing replacement!
  });
} else {
  import("../server.js");
}
```

---

### 3. Production PM2 Cluster Configuration (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: "url-shortener-api",
      script: "./server.js",
      instances: "max", // Utilize all CPU cores
      exec_mode: "cluster",
      max_memory_restart: "500M",
    },
  ],
};
```

---

## 🧪 Verification Benchmark (`npm run test-cluster`)

Run the automated horizontal scaling verification script:

```bash
npm run test-cluster
```

### Output:
```text
======================================================
🌐 STAGE 11: MULTIPLE API SERVERS & HORIZONTAL SCALING BENCHMARK
======================================================

[1] Booted 3 Independent API Server Instances:
    - API Node #1 running on http://127.0.0.1:5081
    - API Node #2 running on http://127.0.0.1:5082
    - API Node #3 running on http://127.0.0.1:5083

[2] Verifying Health & Liveness Probes across all 3 API Nodes...
    - Node Port 5081 | Status: healthy | Mongo: connected | Redis: connected
    - Node Port 5082 | Status: healthy | Mongo: connected | Redis: connected
    - Node Port 5083 | Status: healthy | Mongo: connected | Redis: connected

[3] Sending POST /api/v1/urls to API Node #1 (Port 5081)...
    - Created Short URL: r4TycJD via Node #1

[4] Sending GET /r4TycJD Redirection to API Node #2 (Port 5082)...
    - Redirect Response from Node #2: HTTP 302 -> Target: https://cluster-scale-test.com

[5] Sending GET /api/v1/urls/r4TycJD/stats to API Node #3 (Port 5083)...
    - Stats retrieved from Node #3: Short: r4TycJD

======================================================
🚀 HORIZONTAL SCALING REPORT
======================================================
- API Nodes Tested         : 3 Active Instances
- Stateless Interop        : 100% Shared Redis & MongoDB State
- Create on Node #1        : Success
- Redirect on Node #2      : Success (HTTP 302)
- Stats on Node #3         : Success
======================================================
✅ HORIZONTAL SCALING STAGE 11 VERIFIED 100% SUCCESSFUL!
```
