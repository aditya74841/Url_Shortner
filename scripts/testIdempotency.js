import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";
import UrlService from "../src/services/url.service.js";
import { ClickQueueService } from "../src/services/queue.service.js";
import { analyticsWorker } from "../src/workers/analytics.worker.js";
import ShortUrl from "../src/models/url.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runIdempotencyTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`🛡️ STAGE 9: WORKER CRASH RECOVERY & IDEMPOTENCY TEST`);
  console.log(`======================================================\n`);

  // 1. Create a test short URL
  const targetUrl = `https://idempotency-test-${Date.now()}.com`;
  const { urlDoc } = await UrlService.createShortUrl(targetUrl);
  const shortCode = urlDoc.short;

  console.log(`[1] Created Test Short URL: ${shortCode} (Initial Clicks: 0)`);

  // 2. Clear pre-existing queue state
  await ClickQueueService.clearQueue();

  // 3. Prepare 20 unique event IDs and duplicate 10 of them (30 Total Payload Events)
  console.log(`\n[2] Generating 20 Unique Event IDs + 10 Duplicate Copies...`);
  const uniqueEventIds = Array.from({ length: 20 }, () => crypto.randomUUID());

  const eventPayloads = [];
  // Add 20 unique events
  for (const eventId of uniqueEventIds) {
    eventPayloads.push({
      eventId,
      shortCode,
      ip: "127.0.0.1",
      userAgent: "IdempotencyBenchmark",
      timestamp: Date.now(),
    });
  }

  // Duplicate the first 10 events intentionally
  for (let i = 0; i < 10; i++) {
    eventPayloads.push({
      eventId: uniqueEventIds[i], // Duplicate eventId!
      shortCode,
      ip: "127.0.0.1",
      userAgent: "IdempotencyBenchmark-Duplicate",
      timestamp: Date.now(),
    });
  }

  await ClickQueueService.pushBatchEvents(eventPayloads);
  const initialQueueLen = await ClickQueueService.getQueueLength();
  console.log(`    - Pushed 30 total events into Redis Queue (20 Unique + 10 Duplicates).`);
  console.log(`    - Queue Length in Redis: ${initialQueueLen} events`);

  // 4. SIMULATE WORKER CRASH MID-PROCESSING
  console.log(`\n[3] 💥 SIMULATING WORKER CRASH MID-PROCESSING...`);
  console.log(`    - Popping 15 events into processing queue (RPOPLPUSH)...`);
  
  const { rawPayloads } = await ClickQueueService.popReliableBatch(15);
  const queueAfterPop = await ClickQueueService.getQueueLength();
  const processingLen = await ClickQueueService.getProcessingQueueLength();

  console.log(`    - Main Queue Length      : ${queueAfterPop}`);
  console.log(`    - Processing Queue Length: ${processingLen} (Stranded in RAM due to worker crash!)`);
  console.log(`    - Workers crashed before calling bulkWrite() or acknowledgeBatch()!`);

  // 5. WORKER REBOOT & CRASH RECOVERY
  console.log(`\n[4] 🔄 REBOOTING WORKER & EXECUTING CRASH RECOVERY...`);
  const recoveredCount = await ClickQueueService.recoverStrandedEvents();
  const queueAfterRecovery = await ClickQueueService.getQueueLength();
  const processingAfterRecovery = await ClickQueueService.getProcessingQueueLength();

  console.log(`    - Recovered Stranded Events  : ${recoveredCount}`);
  console.log(`    - Main Queue Length Restored : ${queueAfterRecovery}`);
  console.log(`    - Processing Queue Length    : ${processingAfterRecovery}`);

  // 6. PROCESS BATCH WITH DEDUPLICATION
  console.log(`\n[5] ⚙️ PROCESSING QUEUE WITH ATOMiC EVENT DEDUPLICATION...`);
  const { processed, duplicates } = await analyticsWorker.processBatch();

  // 7. VERIFY FINAL MONGO DB CLICKS STATS
  const updatedDoc = await ShortUrl.findOne({ short: shortCode });
  const finalQueueLen = await ClickQueueService.getQueueLength();
  const finalProcessingLen = await ClickQueueService.getProcessingQueueLength();

  console.log(`\n======================================================`);
  console.log(`🚀 WORKER CRASH RECOVERY & IDEMPOTENCY REPORT`);
  console.log(`======================================================`);
  console.log(`- Total Payloads Sent     : 30 (20 Unique + 10 Duplicates)`);
  console.log(`- Stranded Events Recovered: ${recoveredCount}`);
  console.log(`- Unique Events Ingested  : ${processed} (Expected: 20)`);
  console.log(`- Duplicates Deduplicated : ${duplicates} (Expected: 10)`);
  console.log(`- Final MongoDB Clicks    : ${updatedDoc.clicks} (Expected: 20)`);
  console.log(`- Final Main Queue Length : ${finalQueueLen} (Expected: 0)`);
  console.log(`- Final Processing Queue  : ${finalProcessingLen} (Expected: 0)`);
  console.log(`======================================================`);

  if (
    processed === 20 &&
    duplicates === 10 &&
    updatedDoc.clicks === 20 &&
    finalQueueLen === 0 &&
    finalProcessingLen === 0
  ) {
    console.log(`\n✅ WORKER CRASH RECOVERY & IDEMPOTENCY STAGE 9 VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ IDEMPOTENCY VERIFICATION FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
}

runIdempotencyTest().catch((err) => {
  console.error("Error during idempotency test:", err);
  process.exit(1);
});
