import apiUrlRoutes from "./api/url.routes.js";
import { redirectToFullUrl } from "../controllers/url.controller.js";
import { getHealthStatus } from "../controllers/health.controller.js";
import { readRedirectRateLimiter } from "../middlewares/rateLimiter.middleware.js";

export default async function routes(fastify, options) {
  // Liveness / Readiness Health Probes
  fastify.get("/health", getHealthStatus);
  fastify.get("/api/v1/health", getHealthStatus);

  // Mount REST API routes
  fastify.register(apiUrlRoutes, { prefix: "/api/v1/urls" });

  // Short URL HTTP Redirection endpoint with Rate Limiting
  fastify.get("/:shortUrl", { preHandler: [readRedirectRateLimiter] }, redirectToFullUrl);
}
