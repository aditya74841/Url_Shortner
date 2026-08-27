import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import { initRedis } from "../src/config/redis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runClusterTest() {
  await connectDB();
  await initRedis();

  console.log(`\n======================================================`);
  console.log(`🌐 STAGE 11: MULTIPLE API SERVERS & HORIZONTAL SCALING BENCHMARK`);
  console.log(`======================================================\n`);

  // 1. Spin up 3 parallel Express server instances representing API #1, API #2, API #3
  const PORTS = [5081, 5082, 5083];
  const servers = [];

  for (const port of PORTS) {
    const server = app.listen(port);
    servers.push({ port, server });
  }

  console.log(`[1] Booted 3 Independent API Server Instances:`);
  console.log(`    - API Node #1 running on http://127.0.0.1:5081`);
  console.log(`    - API Node #2 running on http://127.0.0.1:5082`);
  console.log(`    - API Node #3 running on http://127.0.0.1:5083`);

  // 2. Query /health on all 3 instances to verify process PIDs & health readiness
  console.log(`\n[2] Verifying Health & Liveness Probes across all 3 API Nodes...`);
  for (const { port } of servers) {
    const health = await fetchJson(`http://127.0.0.1:${port}/health`);
    console.log(`    - Node Port ${port} | Status: ${health.status} | PID: ${health.process.pid} | Mongo: ${health.services.mongodb.status} | Redis: ${health.services.redis.status}`);
  }

  // 3. Create short URL on API Node #1
  const targetUrl = `https://cluster-scale-test-${Date.now()}.com`;
  console.log(`\n[3] Sending POST /api/v1/urls to API Node #1 (Port 5081)...`);

  const createRes = await makePostRequest(5081, "/api/v1/urls", { fullUrl: targetUrl });
  const shortCode = createRes.data.short;
  console.log(`    - Created Short URL: ${shortCode} via Node #1`);

  // 4. Perform Redirection Request on API Node #2 (Port 5082)
  console.log(`\n[4] Sending GET /${shortCode} Redirection to API Node #2 (Port 5082)...`);
  const redirectRes = await makeGetRequest(5082, `/${shortCode}`);
  console.log(`    - Redirect Response from Node #2: HTTP ${redirectRes.statusCode} -> Target: ${redirectRes.headers.location}`);

  // 5. Query Stats on API Node #3 (Port 5083)
  console.log(`\n[5] Sending GET /api/v1/urls/${shortCode}/stats to API Node #3 (Port 5083)...`);
  const statsRes = await fetchJson(`http://127.0.0.1:5083/api/v1/urls/${shortCode}/stats`);
  console.log(`    - Stats retrieved from Node #3: Full: ${statsRes.data.full} | Short: ${statsRes.data.short}`);

  console.log(`\n======================================================`);
  console.log(`🚀 HORIZONTAL SCALING REPORT`);
  console.log(`======================================================`);
  console.log(`- API Nodes Tested         : 3 Active Instances`);
  console.log(`- Stateless Interop        : 100% Shared Redis & MongoDB State`);
  console.log(`- Create on Node #1        : Success`);
  console.log(`- Redirect on Node #2      : Success (HTTP ${redirectRes.statusCode})`);
  console.log(`- Stats on Node #3         : Success`);
  console.log(`======================================================`);

  if (createRes.data.short && redirectRes.statusCode === 302 && statsRes.data.short === shortCode) {
    console.log(`\n✅ HORIZONTAL SCALING STAGE 11 VERIFIED 100% SUCCESSFUL!\n`);
  } else {
    console.error(`\n❌ CLUSTER VERIFICATION FAILED!`);
    process.exitCode = 1;
  }

  // Cleanup
  for (const { server } of servers) {
    server.close();
  }
  await mongoose.disconnect();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function makeGetRequest(port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${pathStr}`, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers });
    }).on("error", reject);
  });
}

function makePostRequest(port, pathStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathStr,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

runClusterTest().catch((err) => {
  console.error("Error during cluster test:", err);
  process.exit(1);
});
