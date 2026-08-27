import redis, { getIsRedisConnected } from "../config/redis.js";

/**
 * Token Bucket Rate Limiter Middleware Factory
 * Uses Redis Hash to track token balance and last refill timestamp.
 * 
 * @param {Object} options
 * @param {number} options.capacity - Maximum bucket size (e.g., 10 tokens)
 * @param {number} options.refillRatePerSec - Tokens refilled per second (e.g., 10 / 60)
 * @param {string} options.keyPrefix - Prefix for Redis key
 * @param {string} options.message - Custom error message for HTTP 429
 */
export const createTokenBucketRateLimiter = ({
  capacity = 10,
  refillRatePerSec = 10 / 60,
  keyPrefix = "tb:default:",
  message = "Too many requests. Token bucket exhausted.",
}) => {
  return async (req, res, next) => {
    // Allow rate limiter bypass during load/stress benchmarks
    if (process.env.DISABLE_RATE_LIMIT === "true" || !getIsRedisConnected()) {
      return next();
    }

    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() 
                  || req.socket.remoteAddress 
                  || req.ip 
                  || "unknown";
    const redisKey = `${keyPrefix}${clientIp}`;
    const now = Date.now();

    try {
      // Fetch current token state from Redis Hash
      const [tokensStr, lastRefillStr] = await redis.hmget(redisKey, "tokens", "lastRefill");

      let tokens = tokensStr !== null ? parseFloat(tokensStr) : capacity;
      let lastRefill = lastRefillStr !== null ? parseInt(lastRefillStr, 10) : now;

      // Calculate refilled tokens based on elapsed time
      const elapsedSec = (now - lastRefill) / 1000;
      const refilledTokens = elapsedSec * refillRatePerSec;

      // Cap at max capacity
      tokens = Math.min(capacity, tokens + refilledTokens);
      lastRefill = now;

      const windowSeconds = Math.ceil(capacity / refillRatePerSec);

      if (tokens >= 1) {
        // Consume 1 token
        tokens -= 1;

        const multi = redis.multi();
        multi.hset(redisKey, "tokens", tokens, "lastRefill", lastRefill);
        multi.expire(redisKey, windowSeconds);
        await multi.exec();

        res.setHeader("X-RateLimit-Limit", capacity);
        res.setHeader("X-RateLimit-Remaining", Math.floor(tokens));
        return next();
      } else {
        // Token bucket empty: Calculate wait time until 1 token is available
        const secondsToWait = Math.ceil((1 - tokens) / refillRatePerSec);

        res.setHeader("X-RateLimit-Limit", capacity);
        res.setHeader("X-RateLimit-Remaining", 0);
        res.setHeader("Retry-After", secondsToWait);

        return res.status(429).json({
          status: "fail",
          statusCode: 429,
          message,
          retryAfter: `${secondsToWait} seconds`,
        });
      }
    } catch (err) {
      console.warn(`[TokenBucket Warning] ${err.message}. Bypassing rate limit.`);
      next();
    }
  };
};

/**
 * Strict Rate Limiter for Write Operations (POST /api/v1/urls)
 * Token Bucket Capacity: 10 tokens (refills 10 tokens / 60 sec)
 */
export const strictWriteRateLimiter = createTokenBucketRateLimiter({
  capacity: 10,
  refillRatePerSec: 10 / 60,
  keyPrefix: "tb:write:",
  message: "Too many URLs created. Token bucket empty, please wait before trying again.",
});

/**
 * Generous Rate Limiter for Read Operations & Redirection (GET /:shortUrl)
 * Token Bucket Capacity: 100 tokens (refills 100 tokens / 60 sec)
 */
export const readRedirectRateLimiter = createTokenBucketRateLimiter({
  capacity: 100,
  refillRatePerSec: 100 / 60,
  keyPrefix: "tb:read:",
  message: "Too many redirection requests. Token bucket empty, please slow down.",
});
