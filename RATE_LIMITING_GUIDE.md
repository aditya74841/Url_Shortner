# 🔒 Rate Limiting & Abuse Prevention Documentation

## 📌 Overview
This document explains the **Rate Limiting & Abuse Prevention System (Stage 5)** implemented in this URL Shortener project. It details why rate limiting is essential, how the **Token Bucket Algorithm** works, and how it compares to Sliding Window and Fixed Window algorithms.

---

## 🎯 Why Do We Need Rate Limiting?

Without Rate Limiting, backends are vulnerable to 3 critical production failures:

1. **URL Creation Spam**: Malicious scripts creating 10,000 fake shortened URLs per minute, filling up MongoDB disk space with junk data.
2. **DDoS Attacks**: Attackers flooding `GET /:shortCode` with 50,000 requests/second to crash Node.js CPU/RAM.
3. **API Cost Explosions**: Runaway request loops consuming server resources and cloud service quotas.

---

## 🧠 Algorithm Comparison: Token Bucket vs. Sliding Window vs. Fixed Window

| Feature | Token Bucket (Used in Project) | Sliding Window (`ZSET`) | Fixed Window (Basic) |
| :--- | :--- | :--- | :--- |
| **Burst Traffic** | **Allows Controlled Bursts**: Ideal for real users opening multiple tabs. | **Strictly Smoothed**: Caps requests over a rolling window. | **Boundary Spikes**: Vulnerable to 2x traffic bursts at minute boundaries. |
| **Redis Storage** | **Ultra-Lightweight Hash (`HSET`)**: Stores only 2 fields (`tokens`, `lastRefill`). | **Sorted Set (`ZSET`)**: Stores entry for every single request timestamp. | **String Counter (`INCR`)**: Simple integer counter. |
| **Memory Footprint** | **Minimal & Constant O(1)** | O(N) where N is request count | Minimal O(1) |
| **Industry Adoption** | **Amazon AWS, Stripe, Cloudflare** | Payment processing & security | Basic MVP rate limiters |

---

## 🪙 How Token Bucket Works

Imagine a physical bucket assigned to each client IP address:

```text
                  Refill Stream (+1 token every 6 sec)
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │ 🪙 🪙 🪙 🪙 🪙 🪙 🪙 🪙 │  Max Bucket Capacity: 10 Tokens
                     └────────────┬───────────┘
                                  │
                 Request Arrives: Consumes 1 Token
                                  │
                   ┌──────────────┴──────────────┐
                   │                             │
            Tokens Remaining >= 1         Tokens = 0 (Empty!)
                   │                             │
                   ▼                             ▼
          Consume 1 Token (🪙 - 1)     Reject Request (HTTP 429)
            Allow Request                  Retry-After: 6 sec
```

### The Math:
When a request arrives at timestamp `now`:
1. Calculate elapsed time since last request: `elapsed = now - lastRefill`.
2. Calculate refilled tokens: `tokensToAdd = elapsed * refillRatePerSec`.
3. Update bucket: `tokens = Math.min(capacity, currentTokens + tokensToAdd)`.
4. If `tokens >= 1`: Consume 1 token (`tokens = tokens - 1`), update `lastRefill = now`, allow request.
5. If `tokens < 1`: Block request with **`HTTP 429`**.

---

## 🛠️ Code Base Implementation (`src/middlewares/rateLimiter.middleware.js`)

```javascript
import redis, { getIsRedisConnected } from "../config/redis.js";

export const createTokenBucketRateLimiter = ({
  capacity = 10,
  refillRatePerSec = 10 / 60,
  keyPrefix = "tb:default:",
  message = "Too many requests. Token bucket exhausted.",
}) => {
  return async (req, res, next) => {
    if (!getIsRedisConnected()) return next(); // Fallback if Redis is down

    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() 
                  || req.socket.remoteAddress 
                  || req.ip 
                  || "unknown";
    const redisKey = `${keyPrefix}${clientIp}`;
    const now = Date.now();

    try {
      // 1. Fetch current token balance from Redis Hash
      const [tokensStr, lastRefillStr] = await redis.hmget(redisKey, "tokens", "lastRefill");

      let tokens = tokensStr !== null ? parseFloat(tokensStr) : capacity;
      let lastRefill = lastRefillStr !== null ? parseInt(lastRefillStr, 10) : now;

      // 2. Refill tokens based on elapsed time
      const elapsedSec = (now - lastRefill) / 1000;
      const refilledTokens = elapsedSec * refillRatePerSec;

      tokens = Math.min(capacity, tokens + refilledTokens);
      lastRefill = now;

      const windowSeconds = Math.ceil(capacity / refillRatePerSec);

      if (tokens >= 1) {
        tokens -= 1; // Consume 1 token

        const multi = redis.multi();
        multi.hset(redisKey, "tokens", tokens, "lastRefill", lastRefill);
        multi.expire(redisKey, windowSeconds);
        await multi.exec();

        res.setHeader("X-RateLimit-Limit", capacity);
        res.setHeader("X-RateLimit-Remaining", Math.floor(tokens));
        return next();
      } else {
        // Bucket empty: Calculate retry-after time
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
```

---

## 🚦 Configured Protection Tiers

- **Write Tier (`strictWriteRateLimiter`)**: `capacity: 10`, `refillRatePerSec: 10/60` (10 tokens/min) on `POST /api/v1/urls`.
- **Read Tier (`readRedirectRateLimiter`)**: `capacity: 100`, `refillRatePerSec: 100/60` (100 tokens/min) on `GET /:shortUrl`.

---

## 🧪 Verification & Benchmark Command

Run the automated token bucket verification script:

```bash
npm run test-rate-limit
```

### Output:
```text
Request #1  - #10 : Allowed ✅ (Status: 201, Tokens Remaining: 9/10 down to 0/10)
Request #11 - #15 : BLOCKED ❌ (Status: 429 Too Many Requests, Retry-After: 4s)

✅ REDIS TOKEN BUCKET RATE LIMITER VERIFIED 100% SUCCESSFUL!
```
