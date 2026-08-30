import * as urlController from "../../controllers/url.controller.js";
import * as analyticsController from "../../controllers/analytics.controller.js";
import { strictWriteRateLimiter } from "../../middlewares/rateLimiter.middleware.js";

export default async function apiUrlRoutes(fastify, options) {
  fastify.post("/", { preHandler: [strictWriteRateLimiter] }, urlController.createUrl);
  fastify.get("/", urlController.getAllUrls);
  fastify.get("/:shortUrl/stats", urlController.getUrlStats);
  fastify.get("/:shortUrl/analytics", analyticsController.getRichAnalytics);
  fastify.post("/:shortUrl/click", urlController.registerClickApi);
  fastify.post("/click/:shortUrl", urlController.registerClickApi);
}
