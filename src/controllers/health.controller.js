import mongoose from "mongoose";
import { getIsRedisConnected } from "../config/redis.js";
import { ClickQueueService } from "../services/queue.service.js";

/**
 * Liveness and Readiness Health Check Endpoint
 * GET /health & GET /api/v1/health
 */
export const getHealthStatus = async (request, reply) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  const isRedisConnected = getIsRedisConnected();
  const queueLength = await ClickQueueService.getQueueLength();
  const processingQueueLength = await ClickQueueService.getProcessingQueueLength();

  const isHealthy = isMongoConnected && isRedisConnected;
  const statusCode = isHealthy ? 200 : 503;

  return reply.status(statusCode).send({
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    services: {
      mongodb: {
        status: isMongoConnected ? "connected" : "disconnected",
        readyState: mongoose.connection.readyState,
      },
      redis: {
        status: isRedisConnected ? "connected" : "disconnected",
      },
      queue: {
        pendingEvents: queueLength,
        inFlightProcessing: processingQueueLength,
      },
    },
  });
};
