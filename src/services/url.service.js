import ShortUrl from "../models/url.model.js";
import AppError from "../utils/appError.js";

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
   * Find or create short URL
   */
  static async createShortUrl(fullUrl) {
    const normalized = this.normalizeUrl(fullUrl);

    let existing = await ShortUrl.findOne({ full: normalized });
    if (existing) {
      return { urlDoc: existing, created: false };
    }

    const newUrl = await ShortUrl.create({ full: normalized });
    return { urlDoc: newUrl, created: true };
  }

  /**
   * Get all shortened URLs
   */
  static async getAllUrls() {
    return await ShortUrl.find().sort({ createdAt: -1 });
  }

  /**
   * Get URL by short code
   */
  static async getByShortCode(shortCode) {
    const urlDoc = await ShortUrl.findOne({ short: shortCode });
    if (!urlDoc) {
      throw new AppError("Short URL not found", 404);
    }
    return urlDoc;
  }

  /**
   * Atomically increment click count using MongoDB $inc
   * Eliminates race conditions and lost updates under high concurrency.
   * @param {string} shortCode
   * @returns {Promise<Object>}
   */
  static async recordClick(shortCode) {
    const updatedDoc = await ShortUrl.findOneAndUpdate(
      { short: shortCode },
      { $inc: { clicks: 1 } },
      { new: true, runValidators: true }
    );
    if (!updatedDoc) {
      throw new AppError("Short URL not found", 404);
    }
    return updatedDoc;
  }
}

export default UrlService;
