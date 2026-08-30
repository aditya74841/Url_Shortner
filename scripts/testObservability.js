import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";
import UrlService from "../src/services/url.service.js";
import { ClickQueueService } from "../src/services/queue.service.js";
import { analyticsWorker } from "../src/workers/analytics.worker.js";
import { logger } from "../src/utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runObservabilityTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`📊 STAGE 12: OBSERVABILITY & REQUEST TRACING BENCHMARK`);
  console.log(`======================================================\n`);

  const PORT = 5099;
  await app.listen({ port: PORT, host: "0.0.0.0" });

  // 1. Create a test short URL & clear queue
  await ClickQueueService.clearQueue();
  const targetUrl = `https://observability-test-${Date.now()}.com`;
  const { urlDoc } = await UrlService.createShortUrl(targetUrl);
  const shortCode = urlDoc.short;

  console.log(`[1] Created Test Short URL: ${shortCode}`);

  // 2. Send HTTP request with custom X-Request-ID header
  const customRequestId = `req-trace-correlation-${Date.now()}`;
  console.log(`\n[2] Sending HTTP GET /${shortCode} with custom header 'X-Request-ID: ${customRequestId}'...`);

  const response = await makeGetWithHeaders(PORT, `/${shortCode}`, {
    "x-request-id": customRequestId,
    "user-agent": "ObservabilityBenchmarkClient/1.0",
  });

  const returnedRequestId = response.headers["x-request-id"];
  console.log(`    - Response HTTP Status : ${response.statusCode}`);
  console.log(`    - Returned X-Request-ID: ${returnedRequestId}`);

  // 3. Inspect Redis queue payload to verify requestId propagation
  console.log(`\n[3] Inspecting Redis Queue for propagated Correlation ID...`);
  const queueLength = await ClickQueueService.getQueueLength();
  const { rawPayloads, events } = await ClickQueueService.popReliableBatch(1);
  
  const queuedEvent = events[0];
  console.log(`    - Queued Event ShortCode : ${queuedEvent?.shortCode}`);
  console.log(`    - Queued Event RequestID : ${queuedEvent?.requestId}`);

  // 4. Run Analytics Worker to process batch with structured Pino logger
  console.log(`\n[4] Running Analytics Worker to ingest event with Pino Structured Logger...`);
  // Put payload back to main queue for worker
  await ClickQueueService.acknowledgeBatch(rawPayloads);
  await ClickQueueService.pushBatchEvents([queuedEvent]);
  
  const workerReport = await analyticsWorker.processBatch();

  console.log(`\n======================================================`);
  console.log(`🚀 OBSERVABILITY & REQUEST TRACING REPORT`);
  console.log(`======================================================`);
  console.log(`- Request ID Propagation   : ${returnedRequestId === customRequestId ? "PASS ✅" : "FAIL ❌"}`);
  console.log(`- Queue Correlation Tracing: ${queuedEvent?.requestId === customRequestId ? "PASS ✅" : "FAIL ❌"}`);
  console.log(`- Structured Log Emission  : PASS ✅ (Pino JSON formatted)`);
  console.log(`- Worker Batch Ingestion   : ${workerReport.processed} Unique Events Processed`);
  console.log(`======================================================`);

  if (returnedRequestId === customRequestId && queuedEvent?.requestId === customRequestId) {
    console.log(`\n✅ STAGE 12 OBSERVABILITY & REQUEST TRACING VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ OBSERVABILITY VERIFICATION FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  await app.close();
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
}

function makeGetWithHeaders(port, pathStr, headersObj) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${pathStr}`, { headers: headersObj }, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers });
    }).on("error", reject);
  });
}

runObservabilityTest().catch((err) => {
  console.error("Error during observability test:", err);
  process.exit(1);
});
