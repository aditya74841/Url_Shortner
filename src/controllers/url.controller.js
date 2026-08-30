import UrlService from "../services/url.service.js";
import { ClickQueueService } from "../services/queue.service.js";

/**
 * Create a new short URL
 * POST /api/v1/urls
 */
export const createUrl = async (request, reply) => {
  const { fullUrl } = request.body || {};
  const { urlDoc, created } = await UrlService.createShortUrl(fullUrl);

  const statusCode = created ? 201 : 200;
  const host = request.headers.host || "localhost:5000";
  const protocol = request.protocol || "http";

  return reply.status(statusCode).send({
    status: "success",
    data: {
      id: urlDoc._id,
      full: urlDoc.full,
      short: urlDoc.short,
      clicks: urlDoc.clicks,
      shortUrl: `${protocol}://${host}/${urlDoc.short}`,
      createdAt: urlDoc.createdAt,
    },
  });
};

/**
 * Get all short URLs
 * GET /api/v1/urls
 */
export const getAllUrls = async (request, reply) => {
  const urls = await UrlService.getAllUrls();
  return reply.status(200).send({
    status: "success",
    results: urls.length,
    data: { urls },
  });
};

/**
 * Get stats for a specific short code
 * GET /api/v1/urls/:shortUrl/stats
 */
export const getUrlStats = async (request, reply) => {
  const { shortUrl } = request.params;
  const urlDoc = await UrlService.getByShortCode(shortUrl);

  return reply.status(200).send({
    status: "success",
    data: {
      id: urlDoc._id,
      full: urlDoc.full,
      short: urlDoc.short,
      clicks: urlDoc.clicks,
      createdAt: urlDoc.createdAt,
      updatedAt: urlDoc.updatedAt,
    },
  });
};

/**
 * Register click endpoint (API mode)
 * POST /api/v1/urls/:shortUrl/click
 */
export const registerClickApi = async (request, reply) => {
  const { shortUrl } = request.params;

  const clientIp = request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.ip || "unknown";
  const userAgent = request.headers["user-agent"] || "unknown";
  
  ClickQueueService.pushClickEvent({
    shortCode: shortUrl,
    ip: clientIp,
    userAgent,
    requestId: request.id,
  });

  const updatedDoc = await UrlService.recordClick(shortUrl);

  return reply.status(200).send({
    status: "success",
    clicks: updatedDoc.clicks,
    queued: true,
  });
};

/**
 * Perform Non-Blocking Asynchronous HTTP 302 Redirection
 * GET /:shortUrl
 */
export const redirectToFullUrl = async (request, reply) => {
  const { shortUrl } = request.params;

  // 1. Resolve URL target instantly (served from Redis Cache in < 1ms)
  const urlDoc = await UrlService.getByShortCode(shortUrl);

  // 2. Asynchronously push click event to Redis Queue
  const clientIp = request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.ip || "127.0.0.1";
  const userAgent = request.headers["user-agent"] || "unknown";
  const referrer = request.headers["referer"] || request.headers["referrer"] || "";

  ClickQueueService.pushClickEvent({
    shortCode: shortUrl,
    ip: clientIp,
    userAgent,
    referrer,
    requestId: request.id,
    timestamp: Date.now(),
  }).catch((err) => (request.log ? request.log.warn(`[Queue Error] ${err.message}`) : console.warn(`[Queue Error] ${err.message}`)));

  // 3. Fastify HTTP 302 Redirect instantly
  return reply.redirect(urlDoc.full, 302);
};
