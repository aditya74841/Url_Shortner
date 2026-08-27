import UrlService from "../services/url.service.js";
import { ClickQueueService } from "../services/queue.service.js";
import catchAsync from "../utils/catchAsync.js";

/**
 * Create a new short URL
 * POST /api/v1/urls
 */
export const createUrl = catchAsync(async (req, res) => {
  const { fullUrl } = req.body;
  const { urlDoc, created } = await UrlService.createShortUrl(fullUrl);

  const statusCode = created ? 201 : 200;
  res.status(statusCode).json({
    status: "success",
    data: {
      id: urlDoc._id,
      full: urlDoc.full,
      short: urlDoc.short,
      clicks: urlDoc.clicks,
      shortUrl: `${req.protocol}://${req.get("host")}/${urlDoc.short}`,
      createdAt: urlDoc.createdAt,
    },
  });
});

/**
 * Get all short URLs
 * GET /api/v1/urls
 */
export const getAllUrls = catchAsync(async (req, res) => {
  const urls = await UrlService.getAllUrls();
  res.status(200).json({
    status: "success",
    results: urls.length,
    data: { urls },
  });
});

/**
 * Get stats for a specific short code
 * GET /api/v1/urls/:shortUrl/stats
 */
export const getUrlStats = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  const urlDoc = await UrlService.getByShortCode(shortUrl);

  res.status(200).json({
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
});

/**
 * Register click endpoint (API mode)
 * POST /api/v1/urls/:shortUrl/click
 */
export const registerClickApi = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  
  // 1. Push click event to Redis Queue asynchronously
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || req.ip || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  ClickQueueService.pushClickEvent({ shortCode: shortUrl, ip: clientIp, userAgent });

  // 2. Also update live doc synchronously if requested via API
  const updatedDoc = await UrlService.recordClick(shortUrl);

  res.status(200).json({
    status: "success",
    clicks: updatedDoc.clicks,
    queued: true,
  });
});

/**
 * Perform Non-Blocking Asynchronous HTTP 302 Redirection
 * GET /:shortUrl
 */
export const redirectToFullUrl = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;

  // 1. Resolve URL target instantly (served from Redis Cache in < 1ms)
  const urlDoc = await UrlService.getByShortCode(shortUrl);

  // 2. Asynchronously push click event to Redis Queue (Non-Blocking fire-and-forget)
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || req.ip || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";

  ClickQueueService.pushClickEvent({
    shortCode: shortUrl,
    ip: clientIp,
    userAgent,
    requestId: req.id,
    timestamp: Date.now(),
  }).catch((err) => (req.log ? req.log.warn(`[Queue Error] ${err.message}`) : console.warn(`[Queue Error] ${err.message}`)));

  // 3. Return HTTP 302 Redirect instantly (< 1ms Latency!)
  res.redirect(302, urlDoc.full);
});
