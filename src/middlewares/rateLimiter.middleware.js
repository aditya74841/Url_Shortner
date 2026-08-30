import redis, { getIsRedisConnected } from "../config/redis.js";

/**
 * Token Bucket Rate Limiter Factory (Fastify preHandler Hook Compatible)
 */
export const createTokenBucketRateLimiter = ({
  capacity = 10,
  refillRatePerSec = 10 / 60,
  keyPrefix = "tb:default:",
  message = "Too many requests. Token bucket exhausted.",
}) => {
  return async (request, reply) => {
    if (process.env.DISABLE_RATE_LIMIT === "true" || !getIsRedisConnected()) {
      return;
    }

    const clientIp = request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.ip || "unknown";
    const redisKey = `${keyPrefix}${clientIp}`;
    const now = Date.now();

    try {
      const [tokensStr, lastRefillStr] = await redis.hmget(redisKey, "tokens", "lastRefill");

      let tokens = tokensStr !== null ? parseFloat(tokensStr) : capacity;
      let lastRefill = lastRefillStr !== null ? parseInt(lastRefillStr, 10) : now;

      const elapsedSec = (now - lastRefill) / 1000;
      const refilledTokens = elapsedSec * refillRatePerSec;

      tokens = Math.min(capacity, tokens + refilledTokens);
      lastRefill = now;

      const windowSeconds = Math.ceil(capacity / refillRatePerSec);

      if (tokens >= 1) {
        tokens -= 1;

        const multi = redis.multi();
        multi.hset(redisKey, "tokens", tokens, "lastRefill", lastRefill);
        multi.expire(redisKey, windowSeconds);
        await multi.exec();

        reply.header("X-RateLimit-Limit", capacity);
        reply.header("X-RateLimit-Remaining", Math.floor(tokens));
        return;
      } else {
        const secondsToWait = Math.ceil((1 - tokens) / refillRatePerSec);

        reply.header("X-RateLimit-Limit", capacity);
        reply.header("X-RateLimit-Remaining", 0);
        reply.header("Retry-After", secondsToWait);
        return reply.status(429).send({
          status: "fail",
          statusCode: 429,
          message,
          retryAfter: `${secondsToWait} seconds`,
        });
      }
    } catch (err) {
      console.warn(`[TokenBucket Warning] ${err.message}. Bypassing rate limit.`);
    }
  };
};

export const strictWriteRateLimiter = createTokenBucketRateLimiter({
  capacity: 10,
  refillRatePerSec: 10 / 60,
  keyPrefix: "tb:write:",
  message: "Too many URLs created. Token bucket empty, please wait before trying again.",
});

export const readRedirectRateLimiter = createTokenBucketRateLimiter({
  capacity: 100,
  refillRatePerSec: 100 / 60,
  keyPrefix: "tb:read:",
  message: "Too many redirection requests. Token bucket empty, please slow down.",
});
