# Stage 10: Rich Analytics Pipeline & Event Tracking

## Architecture Overview

Stage 10 transforms the URL shortener into a full enterprise analytics platform by streaming structured event metadata (Browser, OS, Device, Referrer, IP, Timestamp) through our decoupled Redis event queue into MongoDB Aggregation pipelines.

```text
                                [ User HTTP Request ]
                                          │
                                          ▼
                              [ Fastify Producer Controller ]
                        (Parses User-Agent & Referrer Headers)
                                          │
                                          ▼
                             [ Redis List Event Queue ]
                             (analytics:url_clicks_queue)
                                          │
                                          ▼
                            [ Analytics Worker Consumer ]
                     (Pipelined Deduplication via SET NX)
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
       [ Bulk Update ShortUrl ]                     [ Bulk Insert UrlAnalytics ]
       (clicks: $inc count)                         (Structured Event Documents)
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │
                                          ▼
                          [ MongoDB Aggregation Pipeline ]
                       (GET /api/v1/urls/:shortUrl/analytics)
```

---

## 🛠️ Components Implemented

1. **`src/models/analytics.model.js`**:
   - Mongoose schema for `UrlAnalytics` storing `short`, `eventId`, `ip`, `browser`, `os`, `device`, `referrer`, and `timestamp`.
   - Indexed on `{ short: 1, timestamp: -1 }` for sub-millisecond aggregation queries.

2. **`src/utils/userAgentParser.js`**:
   - Lightweight zero-dependency parser for extracting Browser (Chrome, Safari, Firefox, Edge), OS (Windows, macOS, Linux, iOS, Android), and Referrer domains.

3. **`src/controllers/analytics.controller.js`**:
   - Exposes `GET /api/v1/urls/:shortUrl/analytics`.
   - Runs parallel MongoDB Aggregations (`$match`, `$group`, `$sort`) for browser, OS, device, and referrer breakdowns.

4. **`src/workers/analytics.worker.js`**:
   - Dual `bulkWrite()` batch ingestion for updating `ShortUrl.clicks` and inserting `UrlAnalytics` click log documents.

---

## 🧪 Verification & Benchmarks

Run automated verification:
```bash
npm run test-analytics
```

### Sample API Output (`GET /api/v1/urls/:shortUrl/analytics`):
```json
{
  "short": "uaW8FMy",
  "full": "https://example.com",
  "totalClicks": 10,
  "breakdown": {
    "browsers": [
      { "browser": "Safari", "clicks": 4 },
      { "browser": "Chrome", "clicks": 4 },
      { "browser": "Firefox", "clicks": 2 }
    ],
    "os": [
      { "os": "iOS", "clicks": 2 },
      { "os": "macOS", "clicks": 2 },
      { "os": "Android", "clicks": 2 },
      { "os": "Linux", "clicks": 2 },
      { "os": "Windows", "clicks": 2 }
    ],
    "devices": [
      { "device": "Desktop", "clicks": 6 },
      { "device": "Mobile", "clicks": 4 }
    ],
    "referrers": [
      { "referrer": "Direct / None", "clicks": 10 }
    ]
  }
}
```
