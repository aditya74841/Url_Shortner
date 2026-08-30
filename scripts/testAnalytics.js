import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { buildApp } from "../src/app.js";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";
import UrlService from "../src/services/url.service.js";
import { ClickQueueService } from "../src/services/queue.service.js";
import { AnalyticsWorker } from "../src/workers/analytics.worker.js";
import ShortUrl from "../src/models/url.model.js";
import UrlAnalytics from "../src/models/analytics.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });
process.env.DISABLE_RATE_LIMIT = "true";

async function runAnalyticsTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`📊 STAGE 10: RICH ANALYTICS PIPELINE VERIFICATION`);
  console.log(`======================================================\n`);

  const app = buildApp();
  const PORT = 5099;
  await app.listen({ port: PORT, host: "0.0.0.0" });

  await ClickQueueService.clearQueue();

  // Step 1: Create a test URL
  const targetUrl = `https://analytics-demo-${Date.now()}.com`;
  const { urlDoc } = await UrlService.createShortUrl(targetUrl);
  const shortCode = urlDoc.short;

  console.log(`[1] Created Test Short URL: ${shortCode} -> ${targetUrl}`);

  // Step 2: Fire requests with simulated User-Agent headers and Referrers
  const testClients = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", ref: "https://t.co/abc123" },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", ref: "https://www.google.com" },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/605.1.15", ref: "https://t.co/xyz789" },
    { ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", ref: "" },
    { ua: "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0", ref: "https://github.com/trending" },
  ];

  console.log(`[2] Simulating 10 Click Events with varied Browsers, OS & Referrers...`);

  for (let i = 0; i < 10; i++) {
    const client = testClients[i % testClients.length];
    await new Promise((resolve) => {
      const req = http.request(
        `http://127.0.0.1:${PORT}/${shortCode}`,
        {
          method: "GET",
          headers: {
            "user-agent": client.ua,
            referer: client.ref,
          },
        },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.end();
    });
  }

  // Step 3: Check Queue Depth
  const qLen = await ClickQueueService.getQueueLength();
  console.log(`[3] Redis Event Queue Length: ${qLen} events buffered`);

  // Step 4: Process batch using AnalyticsWorker
  console.log(`[4] Running AnalyticsWorker to drain queue and build rich analytics...`);
  const worker = new AnalyticsWorker({ batchSize: 100 });
  const report = await worker.processBatch();

  console.log(`    - Batch Ingestion Report: ${report.processed} unique events processed`);

  // Step 5: Query Analytics API Endpoint
  console.log(`\n[5] Querying GET /api/v1/urls/${shortCode}/analytics...`);
  
  const analyticsRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/api/v1/urls/${shortCode}/analytics`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });

  console.log(`\n======================================================`);
  console.log(`📊 STAGE 10 ANALYTICS REPORT RESPONSE`);
  console.log(`======================================================`);
  console.log(JSON.stringify(analyticsRes.data, null, 2));
  console.log(`======================================================\n`);

  if (analyticsRes.status === "success" && analyticsRes.data.totalClicks === 10) {
    console.log(`✅ STAGE 10 RICH ANALYTICS PIPELINE VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`❌ ANALYTICS PIPELINE TEST FAILED!`);
    process.exitCode = 1;
  }

  await app.close();
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
}

runAnalyticsTest().catch((err) => {
  console.error("Error during analytics test:", err);
  process.exit(1);
});
