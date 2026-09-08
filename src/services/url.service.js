import ShortUrl from "../models/url.model.js";
import UrlAnalytics from "../models/analytics.model.js";
import AppError from "../utils/appError.js";
import redis, { getIsRedisConnected } from "../config/redis.js";

const DEFAULT_CACHE_TTL = parseInt(process.env.REDIS_CACHE_TTL || "300", 10);

class UrlService {
  /**
   * Normalize and validate URL format
   * @param {string} url
   * @returns {string}
   */
  static normalizeUrl(url) {
    if (!url) throw new AppError("URL must be provided", 400);
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    try {
      new URL(trimmed);
    } catch {
      throw new AppError("Invalid URL format", 400);
    }
    return trimmed;
  }

  /**
   * Find or create short URL (Cache Warming & Client-Scoped Deduplication)
   * @param {string} fullUrl
   * @param {string} [clientId="anonymous"]
   */
  static async createShortUrl(fullUrl, clientId = "anonymous") {
    const normalized = this.normalizeUrl(fullUrl);
    const targetClientId = clientId || "anonymous";

    let existing = await ShortUrl.findOne({ full: normalized, clientId: targetClientId });
    if (existing) {
      // Warm cache
      await this.cacheUrlDoc(existing);
      return { urlDoc: existing, created: false };
    }

    const newUrl = await ShortUrl.create({ full: normalized, clientId: targetClientId });
    // Warm cache
    await this.cacheUrlDoc(newUrl);

    return { urlDoc: newUrl, created: true };
  }

  /**
   * Get shortened URLs for a given client
   * @param {string} [clientId="anonymous"]
   */
  static async getAllUrls(clientId = "anonymous") {
    const targetClientId = clientId || "anonymous";
    return await ShortUrl.find({ clientId: targetClientId }).sort({ createdAt: -1 });
  }

  /**
   * Get URL by short code with Cache-Aside Strategy
   * @param {string} shortCode
   * @returns {Promise<Object>}
   */
  static async getByShortCode(shortCode) {
    const cacheKey = `url:${shortCode}`;

    // 1. Check Redis Cache
    if (getIsRedisConnected()) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          parsed.isCached = true; // Telemetry indicator for Cache Hit
          return parsed;
        }
      } catch (err) {
        console.warn(`[Redis Read Error] ${err.message}. Falling back to DB.`);
      }
    }

    // 2. Cache Miss -> Query MongoDB
    const urlDoc = await ShortUrl.findOne({ short: shortCode });
    if (!urlDoc) {
      throw new AppError("Short URL not found", 404);
    }

    const plainDoc = urlDoc.toObject();
    plainDoc.isCached = false; // Telemetry indicator for Cache Miss

    // 3. Populate Redis Cache
    await this.cacheUrlDoc(plainDoc);

    return plainDoc;
  }

  /**
   * Helper to write object to Redis cache
   */
  static async cacheUrlDoc(doc) {
    if (!getIsRedisConnected()) return;
    try {
      const cacheKey = `url:${doc.short}`;
      const payload = JSON.stringify(doc);
      await redis.set(cacheKey, payload, "EX", DEFAULT_CACHE_TTL);
    } catch (err) {
      console.warn(`[Redis Write Error] ${err.message}`);
    }
  }

  /**
   * Atomically increment click count using MongoDB $inc
   * and update Redis cache to maintain consistency.
   * @param {string} shortCode
   * @returns {Promise<Object>}
   */
  static async recordClick(shortCode) {
    const updatedDoc = await ShortUrl.findOneAndUpdate(
      { short: shortCode },
      { $inc: { clicks: 1 } },
      { new: true, runValidators: true },
    );

    if (!updatedDoc) {
      throw new AppError("Short URL not found", 404);
    }

    const plainDoc = updatedDoc.toObject();

    // Update Redis cache asynchronously to keep click count in sync
    await this.cacheUrlDoc(plainDoc);

    return plainDoc;
  }

  /**
   * Delete short URL, evict from Redis cache, and purge click analytics
   * @param {string} shortCode
   * @param {string} [clientId="anonymous"]
   * @returns {Promise<Object>}
   */
  static async deleteUrl(shortCode, clientId = "anonymous") {
    const urlDoc = await ShortUrl.findOne({ short: shortCode });
    if (!urlDoc) {
      throw new AppError("Short URL not found", 404);
    }

    // Ownership check: If link belongs to a specific client and caller is not that client
    const targetClientId = clientId || "anonymous";
    if (urlDoc.clientId && urlDoc.clientId !== "anonymous" && urlDoc.clientId !== targetClientId) {
      throw new AppError("You do not have permission to delete this URL", 403);
    }

    // Delete from MongoDB
    await ShortUrl.deleteOne({ _id: urlDoc._id });

    // Evict from Redis Cache
    if (getIsRedisConnected()) {
      try {
        await redis.del(`url:${shortCode}`);
      } catch (err) {
        console.warn(`[Redis Evict Error] ${err.message}`);
      }
    }

    // Clean up analytics events
    try {
      await UrlAnalytics.deleteMany({ short: shortCode });
    } catch (err) {
      console.warn(`[Analytics Cleanup Error] ${err.message}`);
    }

    return urlDoc.toObject();
  }
}

export default UrlService;
