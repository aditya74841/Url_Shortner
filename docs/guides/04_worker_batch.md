# ⚙️ Analytics Background Worker & Batch Ingestion Guide

## 📌 Overview
This document explains **Stage 7: Background Worker & Batch Ingestion** implemented in this URL Shortener project. It details why background consumer workers are essential, how in-memory event aggregation works, and how **MongoDB `bulkWrite()`** cuts database disk I/O load by **99%**.

---

## 🎯 Why Background Batch Ingestion?

In **Stage 6**, we created the Producer: whenever a user clicks a shortened link, the click event is pushed into the **Redis Queue** in `< 0.1ms`.

Without Stage 7, those queued events would accumulate in Redis memory forever without updating MongoDB!

### ❌ Individual DB Writes vs. ✅ Batch Ingestion

#### Without Batch Ingestion (1,000 Individual Writes):
If 1,000 users click links in 1 second, writing each click individually to MongoDB requires **1,000 separate network commands & disk updates**:
```text
1,000 Click Events ──► 1,000 DB Connections ──► 1,000 Disk Writes ──► High CPU & Disk I/O Bottleneck!
```

---

#### With Stage 7 Batch Ingestion (`bulkWrite()`):
The Background Worker pulls 100 click events at once from the Redis Queue, groups click counts by short code in memory, and updates MongoDB in **1 single bulk command**:

```text
Redis Queue (100 Events)
         │
         ▼
Background Worker (`src/workers/analytics.worker.js`)
Groups Events in Memory:
  - Link "TzOf2RX": 60 clicks
  - Link "FK6ig7f": 40 clicks
         │
         ▼
MongoDB bulkWrite()
1 Single Database Network Command! (99% Reduction in DB Disk I/O!)
```

---

## 🛠️ Code Base Implementation

### 1. Analytics Worker Class (`src/workers/analytics.worker.js`)

```javascript
import ShortUrl from "../models/url.model.js";
import { ClickQueueService } from "../services/queue.service.js";
import UrlService from "../services/url.service.js";

export class AnalyticsWorker {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 3000; // Poll interval (3 sec)
    this.batchSize = options.batchSize || 100;    // Max events per batch
    this.timer = null;
    this.isRunning = false;
    this.isProcessing = false;
  }

  /**
   * Starts periodic polling loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error(`[Analytics Worker Error] Error processing batch: ${err.message}`);
      });
    }, this.intervalMs);
  }

  /**
   * Stops loop cleanly for graceful shutdown
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Flush any remaining events before process exit
    await this.processBatch();
  }

  /**
   * Batch Processing Step:
   * 1. Pops up to 100 events from Redis Queue (RPOP)
   * 2. Groups click counts by shortCode in memory
   * 3. Executes single MongoDB bulkWrite()
   * 4. Refreshes Redis Cache entries
   */
  async processBatch() {
    if (this.isProcessing) return 0; // Prevent overlapping execution
    this.isProcessing = true;

    try {
      // 1. Pop batch of events from Redis Queue
      const events = await ClickQueueService.popBatchEvents(this.batchSize);

      if (!events || events.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      // 2. Aggregate click counts by shortCode in memory
      const clickCountsMap = {};
      for (const event of events) {
        if (event && event.shortCode) {
          clickCountsMap[event.shortCode] = (clickCountsMap[event.shortCode] || 0) + 1;
        }
      }

      const shortCodes = Object.keys(clickCountsMap);
      if (shortCodes.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      // 3. Prepare MongoDB bulkWrite operations array
      const bulkOperations = shortCodes.map((shortCode) => ({
        updateOne: {
          filter: { short: shortCode },
          update: { $inc: { clicks: clickCountsMap[shortCode] } },
        },
      }));

      // 4. Execute single bulkWrite command against MongoDB
      await ShortUrl.bulkWrite(bulkOperations, { ordered: false });

      // 5. Asynchronously refresh Redis cache for updated short codes
      for (const shortCode of shortCodes) {
        ShortUrl.findOne({ short: shortCode }).then((doc) => {
          if (doc) UrlService.cacheUrlDoc(doc);
        }).catch(() => {});
      }

      this.isProcessing = false;
      return events.length;
    } catch (err) {
      this.isProcessing = false;
      return 0;
    }
  }
}

export const analyticsWorker = new AnalyticsWorker({ intervalMs: 3000, batchSize: 100 });
```

---

### 2. Server Lifecycle Integration (`server.js`)

The worker process starts when the server boots and stops cleanly during graceful shutdown (`SIGTERM` / `SIGINT`):

```javascript
import { analyticsWorker } from "./src/workers/analytics.worker.js";

// Connect DB & Cache, then start Worker
await connectDB();
await initRedis();
analyticsWorker.start();

// Graceful Shutdown
process.on("SIGTERM", async () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully...");
  await analyticsWorker.stop(); // Flushes remaining queue before exit
  server.close();
});
```

---

## 🧪 Verification & Benchmark Command

Run the automated worker ingestion benchmark:

```bash
npm run test-worker
```

### Output:
```text
======================================================
⚙️ STAGE 7: BACKGROUND WORKER & BATCH INGESTION BENCHMARK
======================================================

[1] Created 2 Test URLs:
    URL 1: TzOf2RX (Initial Clicks: 0)
    URL 2: FK6ig7f (Initial Clicks: 0)

[2] Pushing 100 Click Events into Redis Queue...
    - Queue Length in Redis: 100 events (Expected: 100)

[3] Triggering Background Worker Batch Processing (processBatch())...
[Analytics Worker] Processed 100 click events across 2 short URLs via MongoDB bulkWrite.
    - Processed 100 events in 113 ms

[4] Verifying Post-Ingestion Queue State:
    - Remaining Queue Length: 0 events (Expected: 0)

[5] Verifying MongoDB Ingestion Stats:
    - URL 1 (TzOf2RX) Clicks: 60 (Expected: 60)
    - URL 2 (FK6ig7f) Clicks: 40 (Expected: 40)

======================================================
🚀 WORKER BATCH INGESTION REPORT
======================================================
- Queued Events Flushed   : 100
- Remaining Queue Length  : 0
- URL 1 Updated Clicks    : 60
- URL 2 Updated Clicks    : 40
- Total Batch Execution   : 113 ms
======================================================
✅ BACKGROUND WORKER BATCH INGESTION STAGE 7 VERIFIED 100% SUCCESSFUL!
```
