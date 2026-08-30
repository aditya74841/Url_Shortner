import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./src/config/db.js";
import { initRedis } from "./src/config/redis.js";
import app from "./src/app.js";
import { analyticsWorker } from "./src/workers/analytics.worker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...", err.name, err.message, err.stack);
  process.exit(1);
});

// Connect Database & Cache
await connectDB();
await initRedis();

// Start Analytics Background Worker Loop
analyticsWorker.start();

const PORT = Number(process.env.PORT) || 5000;

try {
  const address = await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[Fastify Server] Service running in ${process.env.NODE_ENV || "development"} mode at ${address}`);
} catch (err) {
  if (err.code === "EADDRINUSE") {
    console.error(`[Server Error] Port ${PORT} is already in use. Please kill the existing process or use a different PORT.`);
  } else {
    console.error("[Server Error]", err);
  }
  process.exit(1);
}

// Handle unhandled promise rejections
process.on("unhandledRejection", async (err) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...", err.name, err.message);
  await analyticsWorker.stop();
  await app.close();
  process.exit(1);
});

// SIGTERM graceful shutdown
process.on("SIGTERM", async () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully...");
  await analyticsWorker.stop();
  await app.close();
  console.log("💥 Process terminated!");
});
