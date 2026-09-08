import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { buildApp } from "../src/app.js";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";
import ShortUrl from "../src/models/url.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });
process.env.DISABLE_RATE_LIMIT = "true";

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode, raw: body });
        }
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTest() {
  console.log(`\n======================================================`);
  console.log(`🔒 CLIENT ISOLATION MULTI-TENANCY TEST`);
  console.log(`======================================================\n`);

  await connectDB();
  await initRedis();

  const app = buildApp();
  const PORT = 5088;
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Test server running on port ${PORT}`);

  const clientA = `client-test-A-${Date.now()}`;
  const clientB = `client-test-B-${Date.now()}`;
  const commonUrl = `https://common-target-${Date.now()}.com`;
  const urlOnlyA = `https://only-a-${Date.now()}.com`;

  try {
    // 1. Client A creates commonUrl
    console.log(`[1] Client A creating short URL for ${commonUrl}...`);
    const resA1 = await makeRequest(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/v1/urls",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-ID": clientA,
        },
      },
      { fullUrl: commonUrl }
    );
    const shortCodeA = resA1.data.data.short;
    console.log(`    Client A got short code: ${shortCodeA} (clientId: ${resA1.data.data.clientId})`);

    // 2. Client B creates the SAME commonUrl
    console.log(`\n[2] Client B creating short URL for SAME destination ${commonUrl}...`);
    const resB1 = await makeRequest(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/v1/urls",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-ID": clientB,
        },
      },
      { fullUrl: commonUrl }
    );
    const shortCodeB = resB1.data.data.short;
    console.log(`    Client B got short code: ${shortCodeB} (clientId: ${resB1.data.data.clientId})`);

    if (shortCodeA === shortCodeB) {
      throw new Error(`FAILED: Client A and Client B got the same short code! Isolation breached.`);
    }
    console.log(`    ✅ SUCCESS: Independent short codes generated for different clients.`);

    // 3. Client A creates a second URL
    console.log(`\n[3] Client A creating second URL: ${urlOnlyA}...`);
    await makeRequest(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/v1/urls",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-ID": clientA,
        },
      },
      { fullUrl: urlOnlyA }
    );

    // 4. Fetch URLs as Client A
    console.log(`\n[4] Querying GET /api/v1/urls as Client A...`);
    const listA = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/v1/urls",
      method: "GET",
      headers: { "X-Client-ID": clientA },
    });
    console.log(`    Client A sees ${listA.data.results} link(s).`);
    const clientAListCodes = listA.data.data.urls.map((u) => u.short);
    console.log(`    Client A link codes:`, clientAListCodes);

    if (listA.data.results !== 2) {
      throw new Error(`FAILED: Client A should see exactly 2 links, but got ${listA.data.results}`);
    }

    // 5. Fetch URLs as Client B
    console.log(`\n[5] Querying GET /api/v1/urls as Client B...`);
    const listB = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/v1/urls",
      method: "GET",
      headers: { "X-Client-ID": clientB },
    });
    console.log(`    Client B sees ${listB.data.results} link(s).`);
    const clientBListCodes = listB.data.data.urls.map((u) => u.short);
    console.log(`    Client B link codes:`, clientBListCodes);

    if (listB.data.results !== 1) {
      throw new Error(`FAILED: Client B should see exactly 1 link, but got ${listB.data.results}`);
    }
    if (clientBListCodes.includes(shortCodeA)) {
      throw new Error(`FAILED: Client B can see Client A's link! Privacy breached.`);
    }
    console.log(`    ✅ SUCCESS: Client B CANNOT see Client A's links.`);

    // 6. Test deduplication for the SAME client
    console.log(`\n[6] Client A shortens ${commonUrl} again (deduplication check)...`);
    const resA2 = await makeRequest(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/v1/urls",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-ID": clientA,
        },
      },
      { fullUrl: commonUrl }
    );
    if (resA2.data.data.short !== shortCodeA) {
      throw new Error(`FAILED: Client A should receive existing short code on duplicate submission.`);
    }
    console.log(`    ✅ SUCCESS: Per-client deduplication returned existing code ${shortCodeA}.`);

    console.log(`\n======================================================`);
    console.log(`🎉 ALL CLIENT ISOLATION TESTS PASSED 100%!`);
    console.log(`======================================================\n`);
  } finally {
    // Cleanup test records
    await ShortUrl.deleteMany({ clientId: { $in: [clientA, clientB] } });
    await app.close();
    await mongoose.disconnect();
  }
}

runTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

