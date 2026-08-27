# 🔒 Rate Limiting & Abuse Prevention Documentation

## 📌 Overview
This document explains the **Rate Limiting & Abuse Prevention System (Stage 5)** implemented in this URL Shortener project. It details why rate limiting is essential, how the **Redis Sliding Window Counter** algorithm works, and how the codebase is structured.

---

## 🎯 Why Do We Need Rate Limiting?

Without Rate Limiting, backends are vulnerable to 3 critical production failures:

1. **URL Creation Spam**: Malicious scripts creating 10,000 fake shortened URLs per minute, filling up MongoDB disk space with junk data.
2. **DDoS Attacks**: Attackers flooding `GET /:shortCode` with 50,000 requests/second to crash Node.js CPU/RAM.
3. **API Cost Explosions**: Runaway request loops consuming server resources and cloud service quotas.

---

## 🧠 Fixed Window vs. Sliding Window Algorithm

### 1. The Problem with Fixed Window Counters
A Fixed Window resets its counter at fixed intervals (e.g., top of every minute: `00:01:00`, `00:02:00`).

#### The Boundary Spike Vulnerability:
Imagine a limit of **10 requests per minute**:
- An attacker sends **10 requests at 00:00:59**.
- The window resets at **00:01:00**.
- The attacker sends **10 requests at 00:01:01**.

```text
Time Window:   [00:00:00 ─── 00:00:59] | [00:01:00 ─── 00:01:59]
Requests:                10 requests   |   10 requests
------------------------------------------------------------------
RESULT: 20 requests processed in 2 SECONDS! (Double the allowed rate limit spike!)
```

---

### 2. The Solution: Redis Sliding Window Counter (`ZSET`)
The **Sliding Window Counter** continuously moves with the current timestamp. Instead of resetting at hard minute boundaries, it looks back dynamically over the last 60 seconds (`now - 60000ms`).

```text
Current Request Time: 00:01:05
Active Window Range:  [00:00:05 ◄────────────────────► 00:01:05]
                      (Only requests within this rolling 60-second window are counted)
```

#### Why Redis Sorted Sets (`ZSET`)?
Redis Sorted Sets store element score-value pairs sorted by score. We use Unix timestamp in milliseconds as the **Score**:
- `ZREMRANGEBYSCORE key 0 (now - 60000)`: Automatically purges requests older than 60 seconds.
- `ZCARD key`: Counts how many requests remain inside the active rolling window.

---

## 🛠️ Code Base Implementation

### 1. Middleware Factory (`src/middlewares/rateLimiter.middleware.js`)

```javascript
import redis, { getIsRedisConnected } from "../config/redis.js";

export const createSlidingWindowRateLimiter = ({
  windowMs = 60000,     // 1 minute time window
  maxRequests = 10,     // Maximum requests allowed in window
  keyPrefix = "rl:default:",
  message = "Too many requests. Please try again later.",
}) => {
  return async (req, res, next) => {
    // 1. Fail-Open Fallback: Bypass rate limit if Redis is down
    if (!getIsRedisConnected()) {
      return next();
    }

    // 2. Extract Client IP Address
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() 
                  || req.socket.remoteAddress 
                  || req.ip 
                  || "unknown";
    const redisKey = `${keyPrefix}${clientIp}`;

    const now = Date.now();
    const windowStart = now - windowMs;
    const windowSeconds = Math.ceil(windowMs / 1000);
    const uniqueMember = `${now}-${Math.random()}`;

    try {
      // 3. Atomic Redis Pipeline
      const multi = redis.multi();
      multi.zremrangebyscore(redisKey, 0, windowStart); // Purge expired entries
      multi.zadd(redisKey, now, uniqueMember);         // Add current request
      multi.zcard(redisKey);                             // Count requests in window
      multi.expire(redisKey, windowSeconds);             // Auto-clean inactive keys

      const results = await multi.exec();
      const currentRequestCount = results[2][1];

      const remaining = Math.max(0, maxRequests - currentRequestCount);
      const resetTimeSeconds = Math.ceil((now + windowMs) / 1000);

      // 4. Inject Standard HTTP Rate Limit Headers
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetTimeSeconds);

      // 5. Block Request if Limit Exceeded
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
```

---

## 🚦 Configured Tiers & Protection Tiers

Different routes require different rate limits:

### A. Strict Write Tier (URL Creation)
- **Endpoint**: `POST /api/v1/urls`
- **Limiter**: `strictWriteRateLimiter`
- **Config**: **10 requests / minute per IP**
- **Reason**: URL creation writes to MongoDB and Redis; must be strictly throttled against spam.

### B. Generous Read Tier (Redirection)
- **Endpoint**: `GET /:shortUrl`
- **Limiter**: `readRedirectRateLimiter`
- **Config**: **100 requests / minute per IP**
- **Reason**: Redirection is served from Redis RAM (< 1ms), so higher traffic volume is permitted for normal browsing.

---

## 📡 HTTP Response Standards for Rate Limiting

When a client hits the rate limit, the server responds with **`HTTP 429 Too Many Requests`**:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1787805600
Retry-After: 60

{
  "status": "fail",
  "statusCode": 429,
  "message": "Too many URLs created from this IP. Please wait 1 minute before trying again.",
  "retryAfter": "60 seconds"
}
```

---

## 🧪 Verification & Benchmark Command

Run the automated rate limit verification script:

```bash
npm run test-rate-limit
```

### Sample Output:
```text
======================================================
🔒 STAGE 5: REDIS SLIDING WINDOW RATE LIMITER BENCHMARK
======================================================
Testing POST /api/v1/urls with Strict Limit = 10 requests / min

Request #1:  Allowed ✅ (Status: 201, Remaining: 9/10)
Request #2:  Allowed ✅ (Status: 201, Remaining: 8/10)
...
Request #10: Allowed ✅ (Status: 201, Remaining: 0/10)
Request #11: BLOCKED ❌ (Status: 429 Too Many Requests, Retry-After: 60s)
Request #12: BLOCKED ❌ (Status: 429 Too Many Requests, Retry-After: 60s)

------------------------------------------------------
SUMMARY RESULT:
- Total Requests Fired : 15
- Allowed Requests     : 10 (Expected: 10)
- Blocked Requests     : 5 (Expected: 5)
------------------------------------------------------
✅ REDIS SLIDING WINDOW RATE LIMITER VERIFIED 100% SUCCESSFUL!
```
