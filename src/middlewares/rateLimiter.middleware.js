import redis, { getIsRedisConnected } from "../config/redis.js";
import AppError from "../utils/appError.js";

/**
 * Redis Sliding Window Rate Limiter Middleware Factory
 * Uses Redis Sorted Sets (ZSET) to track request timestamps within a sliding time window.
 * 
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (e.g., 60000 for 1 minute)
 * @param {number} options.maxRequests - Maximum requests allowed within windowMs
 * @param {string} options.keyPrefix - Prefix for Redis key (e.g., "rl:write:")
 * @param {string} options.message - Custom error message for HTTP 429
 */
export const createSlidingWindowRateLimiter = ({
  windowMs = 60000,
  maxRequests = 10,
  keyPrefix = "rl:default:",
  message = "Too many requests. Please try again later.",
}) => {
  return async (req, res, next) => {
    // If Redis is unavailable, bypass rate limiter gracefully (Fallback)
    if (!getIsRedisConnected()) {
      return next();
    }

    // Extract client IP address safely
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || req.ip || "unknown";
    const redisKey = `${keyPrefix}${clientIp}`;

    const now = Date.now();
    const windowStart = now - windowMs;
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
      // Execute Redis Pipeline for atomic sliding window evaluation
      // 1. Remove elements older than windowStart
      // 2. Add current timestamp to sorted set
      // 3. Count elements remaining in the sliding window
      // 4. Set TTL on key to auto-clean inactive keys
      const uniqueMember = `${now}-${Math.random()}`;

      const multi = redis.multi();
      multi.zremrangebyscore(redisKey, 0, windowStart);
      multi.zadd(redisKey, now, uniqueMember);
      multi.zcard(redisKey);
      multi.expire(redisKey, windowSeconds);

      const results = await multi.exec();

      // results[2][1] contains the count from zcard
      const currentRequestCount = results[2][1];

      const remaining = Math.max(0, maxRequests - currentRequestCount);
      const resetTimeSeconds = Math.ceil((now + windowMs) / 1000);

      // Set standard Rate Limit Headers
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetTimeSeconds);

      // Block request if limit is exceeded
      if (currentRequestCount > maxRequests) {
        const retryAfterSeconds = Math.ceil(windowMs / 1000);
        res.setHeader("Retry-After", retryAfterSeconds);

        return res.status(429).json({
          status: "fail",
          statusCode: 429,
          message,
          retryAfter: `${retryAfterSeconds} seconds`,
        });
      }

      next();
    } catch (err) {
      console.warn(`[RateLimiter Warning] ${err.message}. Bypassing rate limit.`);
      next();
    }
  };
};

/**
 * Strict Rate Limiter for Write Operations (POST /api/v1/urls)
 * Limit: 10 URL creations per 1 minute per IP
 */
export const strictWriteRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyPrefix: "rl:write:",
  message: "Too many URLs created from this IP. Please wait 1 minute before trying again.",
});

/**
 * Generous Rate Limiter for Read Operations & Redirection (GET /:shortUrl)
 * Limit: 100 redirects per 1 minute per IP
 */
export const readRedirectRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  keyPrefix: "rl:read:",
  message: "Too many redirection requests from this IP. Please slow down.",
});
