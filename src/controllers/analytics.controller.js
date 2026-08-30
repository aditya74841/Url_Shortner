import UrlAnalytics from "../models/analytics.model.js";
import ShortUrl from "../models/url.model.js";
import AppError from "../utils/appError.js";

/**
 * Get Rich Analytics for a Short URL
 * GET /api/v1/urls/:shortUrl/analytics
 */
export const getRichAnalytics = async (request, reply) => {
  const { shortUrl } = request.params;

  // Verify short code exists
  const urlDoc = await ShortUrl.findOne({ short: shortUrl });
  if (!urlDoc) {
    throw new AppError("Short URL not found", 404);
  }

  // Run MongoDB Aggregation Pipeline in Parallel
  const [browserStats, osStats, deviceStats, referrerStats, recentClicks] = await Promise.all([
    // 1. Group by Browser
    UrlAnalytics.aggregate([
      { $match: { short: shortUrl } },
      { $group: { _id: "$browser", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // 2. Group by OS
    UrlAnalytics.aggregate([
      { $match: { short: shortUrl } },
      { $group: { _id: "$os", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // 3. Group by Device Type
    UrlAnalytics.aggregate([
      { $match: { short: shortUrl } },
      { $group: { _id: "$device", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // 4. Group by Referrer
    UrlAnalytics.aggregate([
      { $match: { short: shortUrl } },
      { $group: { _id: "$referrer", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // 5. Recent 10 Click Events Log
    UrlAnalytics.find({ short: shortUrl })
      .sort({ timestamp: -1 })
      .limit(10)
      .select("ip browser os device referrer timestamp eventId -_id"),
  ]);

  return reply.status(200).send({
    status: "success",
    data: {
      short: urlDoc.short,
      full: urlDoc.full,
      totalClicks: urlDoc.clicks,
      breakdown: {
        browsers: browserStats.map((item) => ({ browser: item._id, clicks: item.count })),
        os: osStats.map((item) => ({ os: item._id, clicks: item.count })),
        devices: deviceStats.map((item) => ({ device: item._id, clicks: item.count })),
        referrers: referrerStats.map((item) => ({ referrer: item._id, clicks: item.count })),
      },
      recentClicks,
    },
  });
};
