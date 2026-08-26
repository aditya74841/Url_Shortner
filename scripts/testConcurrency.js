import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import ShortUrl from "../src/models/url.model.js";
import UrlService from "../src/services/url.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runConcurrencyTest() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL missing in environment");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  console.log("Connected to MongoDB for Concurrency Benchmark.");

  const testFullUrl = `https://concurrency-benchmark-${Date.now()}.com`;
  
  console.log(`\n[1] Creating fresh test URL: ${testFullUrl}`);
  const { urlDoc } = await UrlService.createShortUrl(testFullUrl);
  const shortCode = urlDoc.short;
  
  console.log(`Short Code created: '${shortCode}', Initial Clicks: ${urlDoc.clicks}`);

  const CONCURRENT_REQUESTS = 300;
  console.log(`\n[2] Firing ${CONCURRENT_REQUESTS} parallel atomic increment requests simultaneously...`);

  const startTime = Date.now();

  // Create array of 300 concurrent promises running in parallel
  const tasks = Array.from({ length: CONCURRENT_REQUESTS }, () =>
    UrlService.recordClick(shortCode)
  );

  await Promise.all(tasks);

  const durationMs = Date.now() - startTime;

  console.log(`[3] All ${CONCURRENT_REQUESTS} requests finished in ${durationMs}ms (${(CONCURRENT_REQUESTS / (durationMs / 1000)).toFixed(2)} req/sec).`);

  // Verify final count in database
  const finalDoc = await ShortUrl.findOne({ short: shortCode });
  console.log(`\n[4] Database Verification Result:`);
  console.log(`- Expected Clicks: ${CONCURRENT_REQUESTS}`);
  console.log(`- Actual Clicks in DB: ${finalDoc.clicks}`);

  if (finalDoc.clicks === CONCURRENT_REQUESTS) {
    console.log(`\n✅ CONCURRENCY TEST PASSED! 100% Accuracy (0 lost updates out of ${CONCURRENT_REQUESTS} concurrent requests).`);
  } else {
    console.error(`\n❌ CONCURRENCY TEST FAILED! Lost ${CONCURRENT_REQUESTS - finalDoc.clicks} updates!`);
    process.exitCode = 1;
  }

  // Cleanup benchmark doc
  await ShortUrl.deleteOne({ _id: finalDoc._id });
  await mongoose.disconnect();
  console.log("[Database] Cleaned benchmark record and disconnected.\n");
}

runConcurrencyTest().catch((err) => {
  console.error("Error during concurrency benchmark:", err);
  process.exit(1);
});
