import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
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

async function runWorkerTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`⚙️ STAGE 7: BACKGROUND WORKER & BATCH INGESTION BENCHMARK`);
  console.log(`======================================================\n`);

  // 1. Create 2 test URLs
  const url1Target = `https://worker-test-1-${Date.now()}.com`;
  const url2Target = `https://worker-test-2-${Date.now()}.com`;

  const { urlDoc: urlDoc1 } = await UrlService.createShortUrl(url1Target);
  const { urlDoc: urlDoc2 } = await UrlService.createShortUrl(url2Target);

  console.log(`[1] Created 2 Test URLs:`);
  console.log(`    URL 1: ${urlDoc1.short} (Initial Clicks: ${urlDoc1.clicks})`);
  console.log(`    URL 2: ${urlDoc2.short} (Initial Clicks: ${urlDoc2.clicks})`);

  // 2. Clear pre-existing queue
  await ClickQueueService.clearQueue();

  // 3. Push 60 click events for URL 1 and 40 click events for URL 2 (Total 100 events)
  console.log(`\n[2] Pushing 100 Click Events into Redis Queue...`);
  
  const batch1 = [];
  for (let i = 0; i < 60; i++) {
    batch1.push({
      shortCode: urlDoc1.short,
      ip: `192.168.1.${i % 10}`,
      userAgent: "WorkerBenchmarkRunner",
      timestamp: Date.now(),
    });
  }

  const batch2 = [];
  for (let i = 0; i < 40; i++) {
    batch2.push({
      shortCode: urlDoc2.short,
      ip: `10.0.0.${i % 10}`,
      userAgent: "WorkerBenchmarkRunner",
      timestamp: Date.now(),
    });
  }

  await ClickQueueService.pushBatchEvents([...batch1, ...batch2]);

  const queuedEvents = await ClickQueueService.getQueueLength();
  console.log(`    - Queue Length in Redis: ${queuedEvents} events (Expected: 100)`);

  // 4. Trigger Background Worker Batch Processing
  console.log(`\n[3] Triggering Background Worker Batch Processing (processBatch())...`);
  const startTime = Date.now();
  
  const processedCount = await analyticsWorker.processBatch();
  const duration = Date.now() - startTime;

  console.log(`    - Processed ${processedCount} events in ${duration} ms`);

  // 5. Verify Queue Drain State
  const remainingQueue = await ClickQueueService.getQueueLength();
  console.log(`\n[4] Verifying Post-Ingestion Queue State:`);
  console.log(`    - Remaining Queue Length: ${remainingQueue} events (Expected: 0)`);

  // 6. Verify MongoDB Ingestion Accuracy
  const updatedDoc1 = await ShortUrl.findOne({ short: urlDoc1.short });
  const updatedDoc2 = await ShortUrl.findOne({ short: urlDoc2.short });

  console.log(`\n[5] Verifying MongoDB Ingestion Stats:`);
  console.log(`    - URL 1 (${urlDoc1.short}) Clicks: ${updatedDoc1.clicks} (Expected: 60)`);
  console.log(`    - URL 2 (${urlDoc2.short}) Clicks: ${updatedDoc2.clicks} (Expected: 40)`);

  console.log(`\n======================================================`);
  console.log(`🚀 WORKER BATCH INGESTION REPORT`);
  console.log(`======================================================`);
  console.log(`- Queued Events Flushed   : ${processedCount}`);
  console.log(`- Remaining Queue Length  : ${remainingQueue}`);
  console.log(`- URL 1 Updated Clicks    : ${updatedDoc1.clicks}`);
  console.log(`- URL 2 Updated Clicks    : ${updatedDoc2.clicks}`);
  console.log(`- Total Batch Execution   : ${duration} ms`);
  console.log(`======================================================`);

  if (remainingQueue === 0 && updatedDoc1.clicks === 60 && updatedDoc2.clicks === 40) {
    console.log(`\n✅ BACKGROUND WORKER BATCH INGESTION STAGE 7 VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ WORKER INGESTION VERIFICATION FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
}

runWorkerTest().catch((err) => {
  console.error("Error during worker test:", err);
  process.exit(1);
});
