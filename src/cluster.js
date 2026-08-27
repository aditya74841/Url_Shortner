import cluster from "node:cluster";
import os from "node:os";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const numCPUs = process.env.WORKERS_COUNT ? parseInt(process.env.WORKERS_COUNT, 10) : os.cpus().length;

if (cluster.isPrimary || cluster.isMaster) {
  console.log(`\n======================================================`);
  console.log(`🌐 NODE.JS MULTI-PROCESS CLUSTER MASTER INITIALIZED`);
  console.log(`======================================================`);
  console.log(`[Master PID: ${process.pid}] Forking ${numCPUs} API Worker Instances...`);

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("online", (worker) => {
    console.log(`[Cluster Master] Worker Node #${worker.id} (PID: ${worker.process.pid}) is ONLINE`);
  });

  // Auto-healing: Replace dead worker instances automatically
  cluster.on("exit", (worker, code, signal) => {
    console.warn(`[Cluster Master Warning] Worker Node #${worker.id} (PID: ${worker.process.pid}) died (Code: ${code}, Signal: ${signal}). Spawning replacement...`);
    cluster.fork();
  });
} else {
  // Worker processes import and run server entry point
  import("../server.js");
}
