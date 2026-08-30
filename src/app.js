import Fastify from "fastify";
import formbody from "@fastify/formbody";
import routes from "./routes/index.js";
import { logger } from "./utils/logger.js";
import { v4 as uuidv4 } from "uuid";

import cors from "@fastify/cors";

export const buildApp = () => {
  const fastify = Fastify({
    loggerInstance: logger,
    genReqId: (req) => req.headers["x-request-id"] || `req-${uuidv4()}`,
    requestIdHeader: "x-request-id",
  });

  // Register CORS to allow requests from Next.js client
  fastify.register(cors, {
    origin: true, // Allow all origins in dev or specify process.env.CLIENT_URL
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // Register form body parser
  fastify.register(formbody);

  // Ensure X-Request-ID correlation header is present in all HTTP responses
  fastify.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Custom request telemetry logging hook
  fastify.addHook("onResponse", async (request, reply) => {
    const responseTime = reply.elapsedTime;
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: Math.round(responseTime * 100) / 100,
        ip: request.ip,
        userAgent: request.headers["user-agent"] || "unknown",
      },
      `[HTTP ${reply.statusCode < 400 ? "Success" : "Error"}] ${request.method} ${request.url} HTTP ${reply.statusCode} in ${responseTime.toFixed(2)}ms`
    );
  });

  // Mount Routes
  fastify.register(routes);

  // 404 Handler for undefined routes
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      status: "fail",
      statusCode: 404,
      message: `Cannot find ${request.url} on this server!`,
    });
  });

  // Global Error Handling Middleware
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    const status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    request.log.error(error);

    reply.status(statusCode).send({
      status,
      statusCode,
      message: error.message || "Internal Server Error",
    });
  });

  // Standard Express-style .listen() wrapper for script compatibility
  const originalListen = fastify.listen.bind(fastify);
  fastify.listen = (portOrOpts, cb) => {
    if (typeof portOrOpts === "number" || typeof portOrOpts === "string") {
      const port = Number(portOrOpts);
      originalListen({ port, host: "0.0.0.0" }, (err, address) => {
        if (cb) cb(err, address);
      });
      return fastify.server;
    }
    return originalListen(portOrOpts, cb);
  };

  return fastify;
};

const app = buildApp();
export default app;
