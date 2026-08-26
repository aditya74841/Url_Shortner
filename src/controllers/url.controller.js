import UrlService from "../services/url.service.js";
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
 * Register click endpoint (Atomic Increment)
 * POST /api/v1/urls/:shortUrl/click
 */
export const registerClickApi = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  const updatedDoc = await UrlService.recordClick(shortUrl);

  res.status(200).json({
    status: "success",
    clicks: updatedDoc.clicks,
  });
});

/**
 * Perform HTTP Redirection with Atomic Click Tracking
 * GET /:shortUrl
 */
export const redirectToFullUrl = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  const updatedDoc = await UrlService.recordClick(shortUrl);

  res.redirect(302, updatedDoc.full);
});
