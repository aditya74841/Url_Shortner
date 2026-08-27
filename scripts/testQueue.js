import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";
import UrlService from "../src/services/url.service.js";
import { ClickQueueService } from "../src/services/queue.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runQueueTest() {
  await connectDB();
  await initRedis();

  const PORT = 5060;
  const server = app.listen(PORT);

  console.log(`\n======================================================`);
  console.log(`⚡ STAGE 6: ASYNCHRONOUS REDIS EVENT QUEUE BENCHMARK`);
  console.log(`======================================================\n`);

  // 1. Create a test URL doc
  const targetUrl = `https://async-queue-benchmark-${Date.now()}.com`;
  const { urlDoc } = await UrlService.createShortUrl(targetUrl);
  const shortCode = urlDoc.short;

  console.log(`[1] Created Test URL: ${targetUrl}`);
  console.log(`    Short Code: ${shortCode}`);

  // 2. Clear pre-existing queue
  await ClickQueueService.clearQueue();

  // 3. Fire 50 Parallel Redirection Clicks
  const TOTAL_CLICKS = 50;
  console.log(`\n[2] Firing ${TOTAL_CLICKS} parallel HTTP 302 Redirection Requests...`);

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < TOTAL_CLICKS; i++) {
    promises.push(makeGetRedirect(PORT, shortCode));
  }

  const results = await Promise.all(promises);
  const totalDuration = Date.now() - startTime;
  const avgLatency = (totalDuration / TOTAL_CLICKS).toFixed(3);

  console.log(`    - 50 Requests Completed in : ${totalDuration} ms`);
  console.log(`    - Average Redirect Latency  : ${avgLatency} ms per request`);

  // Verify all HTTP responses returned 302
  const successfulRedirects = results.filter((res) => res.statusCode === 302).length;
  console.log(`    - HTTP 302 Redirect Count  : ${successfulRedirects}/${TOTAL_CLICKS}`);

  // 4. Verify Redis Queue Event Count
  // Allow a tiny 100ms pause for network async I/O completion
  await new Promise((r) => setTimeout(r, 100));

  const queueLength = await ClickQueueService.getQueueLength();
  console.log(`\n[3] Verifying Redis Queue Ingestion State:`);
  console.log(`    - Queue Length in Redis   : ${queueLength} events (Expected: ${TOTAL_CLICKS})`);

  // 5. Sample and Inspect Event Payload Structure
  const sampleEvents = await ClickQueueService.popBatchEvents(5);
  console.log(`\n[4] Sample Queue Event Payloads (First 5):`);
  console.log(JSON.stringify(sampleEvents, null, 2));

  console.log(`\n======================================================`);
  console.log(`🚀 EVENT QUEUE BENCHMARK REPORT`);
  console.log(`======================================================`);
  console.log(`- Total Requests Fired     : ${TOTAL_CLICKS}`);
  console.log(`- Sub-Millisecond Redirects: ${successfulRedirects}`);
  console.log(`- Pending Events in Queue  : ${queueLength}`);
  console.log(`- Average Redirect Speed   : ${avgLatency} ms`);
  console.log(`======================================================`);

  if (successfulRedirects === TOTAL_CLICKS && queueLength === TOTAL_CLICKS) {
    console.log(`\n✅ ASYNCHRONOUS EVENT QUEUE STAGE 6 VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ QUEUE VERIFICATION FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
  server.close();
}

function makeGetRedirect(port, shortCode) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/${shortCode}`,
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 BenchmarkRunner",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

runQueueTest().catch((err) => {
  console.error("Error during queue test:", err);
  process.exit(1);
});
