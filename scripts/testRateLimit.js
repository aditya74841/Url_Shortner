import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import redis, { initRedis } from "../src/config/redis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runRateLimitTest() {
  await connectDB();
  await initRedis();

  const PORT = 5055;
  const server = app.listen(PORT);

  console.log(`\n======================================================`);
  console.log(`🔒 STAGE 5: REDIS SLIDING WINDOW RATE LIMITER BENCHMARK`);
  console.log(`======================================================`);
  console.log(`Testing POST /api/v1/urls with Strict Limit = 10 requests / min\n`);

  // Clear rate limiter key for test runner IP before starting
  const testIpKey = `rl:write:127.0.0.1`;
  await redis.del(testIpKey);

  const TOTAL_REQUESTS = 15;
  let allowedCount = 0;
  let blockedCount = 0;

  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    const response = await makePostRequest(PORT, `https://rate-limit-test-${i}.com`);
    
    const limit = response.headers["x-ratelimit-limit"];
    const remaining = response.headers["x-ratelimit-remaining"];

    if (response.statusCode === 201 || response.statusCode === 200) {
      allowedCount++;
      console.log(`Request #${i}: Allowed ✅ (Status: ${response.statusCode}, Remaining: ${remaining}/${limit})`);
    } else if (response.statusCode === 429) {
      blockedCount++;
      console.log(`Request #${i}: BLOCKED ❌ (Status: 429 Too Many Requests, Retry-After: ${response.headers["retry-after"]}s)`);
    } else {
      console.log(`Request #${i}: Unexpected Status ${response.statusCode}`);
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`SUMMARY RESULT:`);
  console.log(`- Total Requests Fired : ${TOTAL_REQUESTS}`);
  console.log(`- Allowed Requests     : ${allowedCount} (Expected: 10)`);
  console.log(`- Blocked Requests     : ${blockedCount} (Expected: 5)`);
  console.log(`------------------------------------------------------`);

  if (allowedCount === 10 && blockedCount === 5) {
    console.log(`\n✅ REDIS SLIDING WINDOW RATE LIMITER VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ RATE LIMITER VERIFICATION FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  await redis.del(testIpKey);
  await mongoose.disconnect();
  server.close();
}

function makePostRequest(port, fullUrl) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ fullUrl });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/urls",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "x-forwarded-for": "127.0.0.1",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

runRateLimitTest().catch((err) => {
  console.error("Error during rate limit test:", err);
  process.exit(1);
});
