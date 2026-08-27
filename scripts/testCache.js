import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import ShortUrl from "../src/models/url.model.js";
import UrlService from "../src/services/url.service.js";
import redis, { initRedis } from "../src/config/redis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runCacheBenchmark() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL missing");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  await initRedis();
  console.log("Connected to MongoDB & Redis for Cache Benchmark.");

  const testFullUrl = `https://redis-cache-benchmark-${Date.now()}.com`;

  console.log(`\n[1] Creating test URL: ${testFullUrl}`);
  const { urlDoc } = await UrlService.createShortUrl(testFullUrl);
  const shortCode = urlDoc.short;

  // Clear cache initially to guarantee a Cache Miss on first request
  await redis.del(`url:${shortCode}`);

  console.log(`\n[2] Executing 1st Request (Cache MISS -> Querying MongoDB)...`);
  const t0 = performance.now();
  const missResult = await UrlService.getByShortCode(shortCode);
  const missLatency = (performance.now() - t0).toFixed(3);

  console.log(`- Response Status: Success`);
  console.log(`- Is Cached: ${missResult.isCached}`);
  console.log(`- MongoDB Latency: ${missLatency} ms`);

  console.log(`\n[3] Executing 2nd Request (Cache HIT -> In-Memory Redis Lookup)...`);
  const t1 = performance.now();
  const hitResult = await UrlService.getByShortCode(shortCode);
  const hitLatency = (performance.now() - t1).toFixed(3);

  console.log(`- Response Status: Success`);
  console.log(`- Is Cached: ${hitResult.isCached}`);
  console.log(`- Redis Latency: ${hitLatency} ms`);

  const speedup = (missLatency / hitLatency).toFixed(1);

  console.log(`\n======================================================`);
  console.log(`🚀 REDIS CACHE BENCHMARK PERFORMANCE REPORT`);
  console.log(`======================================================`);
  console.log(`- MongoDB Query Latency (Cache Miss) : ${missLatency} ms`);
  console.log(`- Redis Cache Latency (Cache Hit)    : ${hitLatency} ms`);
  console.log(`- Performance Improvement            : ${speedup}x Faster!`);
  console.log(`======================================================\n`);

  if (hitResult.isCached && parseFloat(hitLatency) < parseFloat(missLatency)) {
    console.log(`✅ REDIS CACHING STAGE 4 VERIFIED SUCCESSFULLY!`);
  } else {
    console.warn(`⚠️ Warning: Cache performance test did not register speedup.`);
  }

  // Cleanup
  await ShortUrl.deleteOne({ short: shortCode });
  await redis.del(`url:${shortCode}`);
  await mongoose.disconnect();
  redis.disconnect();
  console.log("[Database & Redis] Cleaned up and disconnected cleanly.");
}

runCacheBenchmark().catch((err) => {
  console.error("Error during cache benchmark:", err);
  process.exit(1);
});
