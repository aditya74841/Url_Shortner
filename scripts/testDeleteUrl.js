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

async function runDeleteTest() {
  console.log(`\n======================================================`);
  console.log(`🗑️ DELETE SHORT URL FEATURE VERIFICATION TEST`);
  console.log(`======================================================\n`);

  await connectDB();
  await initRedis();

  const app = buildApp();
  const PORT = 5089;
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Test server running on port ${PORT}`);

  const clientA = `client-delete-A-${Date.now()}`;
  const clientB = `client-delete-B-${Date.now()}`;
  const testUrl = `https://delete-test-${Date.now()}.com`;

  try {
    // 1. Client A creates a short URL
    console.log(`[1] Client A creates a short link for ${testUrl}...`);
    const createRes = await makeRequest(
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
      { fullUrl: testUrl }
    );
    const shortCode = createRes.data.data.short;
    console.log(`    Created shortCode: ${shortCode}`);

    // 2. Warm cache via redirect
    console.log(`\n[2] Warming cache via GET /${shortCode}...`);
    const redirectRes = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: `/${shortCode}`,
      method: "GET",
    });
    console.log(`    Redirect response status: ${redirectRes.statusCode}`);

    // 3. Unauthorized deletion attempt (Client B tries to delete Client A's link)
    console.log(`\n[3] Client B attempts to delete Client A's link (Ownership Security Check)...`);
    const deleteResB = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: `/api/v1/urls/${shortCode}`,
      method: "DELETE",
      headers: { "X-Client-ID": clientB },
    });
    console.log(`    Status code received: ${deleteResB.statusCode}`);
    if (deleteResB.statusCode !== 403) {
      throw new Error(`FAILED: Expected 403 Forbidden, but received ${deleteResB.statusCode}`);
    }
    console.log(`    ✅ SUCCESS: Unauthorized deletion blocked with HTTP 403 Forbidden.`);

    // 4. Authorized deletion attempt (Client A deletes their own link)
    console.log(`\n[4] Client A deletes their own short link...`);
    const deleteResA = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: `/api/v1/urls/${shortCode}`,
      method: "DELETE",
      headers: { "X-Client-ID": clientA },
    });
    console.log(`    Status code received: ${deleteResA.statusCode}`);
    if (deleteResA.statusCode !== 200) {
      throw new Error(`FAILED: Expected 200 OK, but received ${deleteResA.statusCode}`);
    }
    console.log(`    ✅ SUCCESS: Link deleted successfully.`);

    // 5. Verify link is gone from Client A's dashboard
    console.log(`\n[5] Querying GET /api/v1/urls for Client A...`);
    const listRes = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/v1/urls",
      method: "GET",
      headers: { "X-Client-ID": clientA },
    });
    const found = listRes.data.data.urls.some((u) => u.short === shortCode);
    if (found) {
      throw new Error(`FAILED: Deleted link still returned in GET /api/v1/urls`);
    }
    console.log(`    ✅ SUCCESS: Link is absent from dashboard list.`);

    // 6. Verify cache invalidation & redirect returns 404
    console.log(`\n[6] Testing redirect to deleted link: GET /${shortCode}...`);
    const postDeleteRedirect = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: `/${shortCode}`,
      method: "GET",
    });
    console.log(`    Status code received: ${postDeleteRedirect.statusCode}`);
    if (postDeleteRedirect.statusCode !== 404) {
      throw new Error(`FAILED: Expected 404 for deleted link redirect, but got ${postDeleteRedirect.statusCode}`);
    }
    console.log(`    ✅ SUCCESS: Redis cache evicted and DB returns 404.`);

    // 7. Test deleting non-existent link returns 404
    console.log(`\n[7] Attempting to delete already deleted link (404 check)...`);
    const repeatDelete = await makeRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: `/api/v1/urls/${shortCode}`,
      method: "DELETE",
      headers: { "X-Client-ID": clientA },
    });
    if (repeatDelete.statusCode !== 404) {
      throw new Error(`FAILED: Expected 404 on deleting non-existent URL, but got ${repeatDelete.statusCode}`);
    }
    console.log(`    ✅ SUCCESS: Repeat delete returns HTTP 404.`);

    console.log(`\n======================================================`);
    console.log(`🎉 ALL DELETE FEATURE TESTS PASSED 100%!`);
    console.log(`======================================================\n`);
  } finally {
    await app.close();
    await mongoose.disconnect();
  }
}

runDeleteTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

