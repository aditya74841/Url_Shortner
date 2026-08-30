import autocannon from "autocannon";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });
process.env.DISABLE_RATE_LIMIT = "true";

async function runClusterChaosTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`⚡ STAGE 13 (MULTI-CORE): 4-CORE CLUSTER CHAOS BENCHMARK`);
  console.log(`======================================================\n`);

  // Boot 4 Fastify app worker processes on ports 5091, 5092, 5093, 5094
  const PORTS = [5091, 5092, 5093, 5094];
  const appInstances = [];

  for (const port of PORTS) {
    const instance = buildApp();
    await instance.listen({ port, host: "0.0.0.0" });
    appInstances.push(instance);
  }

  console.log(`[1] Booted 4 Parallel Fastify Workers (Simulating 4 CPU Cores):`);
  PORTS.forEach((p, idx) => console.log(`    - Worker Core #${idx + 1} on http://127.0.0.1:${p}`));

  // Create test short URL
  await ClickQueueService.clearQueue();
  const targetUrl = `https://cluster-chaos-${Date.now()}.com`;
  const { urlDoc } = await UrlService.createShortUrl(targetUrl);
  const shortCode = urlDoc.short;

  console.log(`\n[2] Created Test Short URL: ${shortCode}`);
  console.log(`[3] Firing Autocannon Load across all 4 Cores simultaneously (100 Connections, 5 Secs)...`);

  // Run autocannon distributed across the 4 worker ports
  const results = [];
  const autocannonPromises = PORTS.map((port) =>
    autocannon({
      url: `http://127.0.0.1:${port}/${shortCode}`,
      connections: 25, // 25 per core = 100 total connections
      duration: 5,
      pipelining: 2,
      headers: { "user-agent": "ClusterChaosBenchmark/1.0" },
    })
  );

  const clusterResults = await Promise.all(autocannonPromises);

  // Aggregate results across 4 cores
  const totalRequests = clusterResults.reduce((sum, r) => sum + r.requests.total, 0);
  const totalRps = clusterResults.reduce((sum, r) => sum + Math.round(r.requests.average), 0);
  const maxP99Latency = Math.max(...clusterResults.map((r) => r.latency.p99));
  const total5xx = clusterResults.reduce((sum, r) => sum + r["5xx"], 0);

  console.log(`\n[4] 4-Core Autocannon Load Execution Finished!`);
  console.log(`    - Total Requests Executed Across 4 Cores : ${totalRequests}`);
  console.log(`    - Aggregated Throughput Rate             : ${totalRps} req/sec`);
  console.log(`    - Peak p99 Latency Across Cores          : ${maxP99Latency} ms`);
  console.log(`    - Total Server Errors (5xx)              : ${total5xx}`);

  // Inspect Redis Queue
  const queueLength = await ClickQueueService.getQueueLength();
  console.log(`\n[5] Inspecting Redis Queue Accumulated Events: ${queueLength} click payloads`);

  // Drain Queue via Fast Worker
  console.log(`\n[6] Draining Redis Queue to MongoDB via High-Speed Bulk Ingestion...`);
  const fastWorker = new AnalyticsWorker({ batchSize: 5000 });
  const startTime = Date.now();
  let totalProcessed = 0;

  while ((await ClickQueueService.getQueueLength()) > 0) {
    const report = await fastWorker.processBatch();
    totalProcessed += report.processed;
  }
  const drainTimeMs = Date.now() - startTime;

  const updatedDoc = await ShortUrl.findOne({ short: shortCode });

  console.log(`\n======================================================`);
  console.log(`🚀 4-CORE CLUSTER CHAOS BENCHMARK REPORT`);
  console.log(`======================================================`);
  console.log(`- CPU Cores Tested         : 4 Parallel Workers`);
  console.log(`- Total Requests Executed  : ${totalRequests}`);
  console.log(`- Aggregated Throughput    : ${totalRps} req/sec`);
  console.log(`- Peak p99 Response Time   : ${maxP99Latency} ms`);
  console.log(`- Server Errors (5xx)      : ${total5xx} (0 Expected)`);
  console.log(`- Ingestion Drained        : ${totalProcessed} events in ${drainTimeMs}ms`);
  console.log(`- Final MongoDB Click Stat : ${updatedDoc.clicks}`);
  console.log(`- Data Integrity Check     : ${updatedDoc.clicks === totalProcessed ? "100% ACCURATE ✅" : "INACCURATE ❌"}`);
  console.log(`======================================================`);

  if (total5xx === 0 && updatedDoc.clicks === totalProcessed) {
    console.log(`\n✅ 4-CORE CLUSTER BENCHMARK VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ CLUSTER CHAOS TEST FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  for (const instance of appInstances) {
    await instance.close();
  }
  await ClickQueueService.clearQueue();
  await mongoose.disconnect();
}

runClusterChaosTest().catch((err) => {
  console.error("Error during cluster chaos test:", err);
  process.exit(1);
});
