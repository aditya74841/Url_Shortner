import autocannon from "autocannon";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";
import UrlService from "../src/services/url.service.js";
import { ClickQueueService } from "../src/services/queue.service.js";
import { AnalyticsWorker } from "../src/workers/analytics.worker.js";
import ShortUrl from "../src/models/url.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });
process.env.DISABLE_RATE_LIMIT = "true";

async function runChaosLoadTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`⚡ STAGE 13: HIGH-CONCURRENCY LOAD & CHAOS BENCHMARK`);
  console.log(`======================================================\n`);

  const PORT = 5098;
  await app.listen({ port: PORT, host: "0.0.0.0" });

  // 1. Create a test short URL & clear queue
  await ClickQueueService.clearQueue();
  const targetUrl = `https://chaos-load-test-${Date.now()}.com`;
  const { urlDoc } = await UrlService.createShortUrl(targetUrl);
  const shortCode = urlDoc.short;

  console.log(`[1] Created Test Short URL: ${shortCode}`);
  console.log(`[2] Starting Autocannon Load Generator: 50 Concurrent Connections for 5 Seconds...`);

  // 2. Execute Autocannon Load Test against GET /:shortUrl
  const result = await autocannon({
    url: `http://127.0.0.1:${PORT}/${shortCode}`,
    connections: 50,
    duration: 5,
    pipelining: 1,
    headers: {
      "user-agent": "ChaosLoadBenchmarkClient/1.0",
    },
  });

  console.log(`\n[3] Autocannon Load Execution Finished!`);
  console.log(`    - Total Requests Fired : ${result.requests.total}`);
  console.log(`    - Requests Per Second  : ${Math.round(result.requests.average)} req/sec`);
  console.log(`    - Latency (p50)        : ${result.latency.p50} ms`);
  console.log(`    - Latency (p95)        : ${result.latency.p95} ms`);
  console.log(`    - Latency (p99)        : ${result.latency.p99} ms`);
  console.log(`    - HTTP 302 Redirects   : ${result["3xx"]}`);
  console.log(`    - Server Errors (5xx)  : ${result["5xx"]}`);
  console.log(`    - Network Connection Errs: ${result.errors}`);

  // 3. Inspect Redis Queue depth after load test
  console.log(`\n[4] Inspecting Redis Queue Depth & Ingestion Batch Pipeline...`);
  const queueLength = await ClickQueueService.getQueueLength();
  console.log(`    - Redis Queue Accumulated Events: ${queueLength} click payloads`);

  // 4. Run High-Speed Fast Worker (batchSize: 2000) to drain queue in 1 step
  console.log(`\n[5] Draining Redis Queue to MongoDB via High-Speed Bulk Ingestion...`);
  const fastWorker = new AnalyticsWorker({ batchSize: 2000 });
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalDuplicates = 0;

  while ((await ClickQueueService.getQueueLength()) > 0) {
    const report = await fastWorker.processBatch();
    totalProcessed += report.processed;
    totalDuplicates += report.duplicates;
  }
  const drainTimeMs = Date.now() - startTime;

  // 5. Verify final MongoDB click count
  const updatedDoc = await ShortUrl.findOne({ short: shortCode });

  console.log(`\n======================================================`);
  console.log(`🚀 LOAD & CHAOS RESILIENCE REPORT`);
  console.log(`======================================================`);
  console.log(`- Total Requests Executed  : ${result.requests.total}`);
  console.log(`- Throughput Rate          : ${Math.round(result.requests.average)} req/sec`);
  console.log(`- p99 Response Latency     : ${result.latency.p99} ms`);
  console.log(`- Server Error Rate (5xx)  : ${result["5xx"]} (0 Expected)`);
  console.log(`- Queue Ingestion Drained  : ${totalProcessed} events in ${drainTimeMs}ms`);
  console.log(`- Final MongoDB Click Stat : ${updatedDoc.clicks}`);
  console.log(`- Data Integrity Check     : ${updatedDoc.clicks === totalProcessed ? "100% ACCURATE ✅" : "INACCURATE ❌"}`);
  console.log(`======================================================`);

  if (result["5xx"] === 0 && result.errors === 0 && updatedDoc.clicks === totalProcessed) {
    console.log(`\n✅ STAGE 13 HIGH-CONCURRENCY LOAD & CHAOS TEST VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ LOAD & CHAOS TEST FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  await app.close();
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
}

runChaosLoadTest().catch((err) => {
  console.error("Error during chaos load test:", err);
  process.exit(1);
});
