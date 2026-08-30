-------------------------------------------------------------------------
THIS IS THE FIRST PHASE OF THE URL SHORTNER PROJECT.
---

---

Intially this project is simple User sumbmit the Url we covert it into the short URL storing the FUll URL and short URL in the database we also counting the Clicks then redirect to the Full URL.

SO the userflow of Click short url is
User click shortURL -> increaset the count of the clicks-> redirect

We are also using the EJS

---

## THIS IS THE SECOND PHASE OF THE URL SHORTNER PROJECT.

In first step In phase 1
First in this we created a proper server folder structure

Where we created the routes in route folder then controllers and services folders where we stored the logic of the application.
Implemented the error middleware and gloabl error handler

The second step is
We Then remove the ejs code
We will create a separate client for this

The Third step

We have implemented the mongoDB index to get the faster read
urlSchema.index({ short: 1 }, { unique: true, name: "idx_short_code" });
urlSchema.index({ full: 1 }, { unique: true, name: "idx_full_url" });
urlSchema.index({ createdAt: -1 }, { name: "idx_created_at_desc" });

Also wrote one blog on MongoDB Index

It gets the faster read than tradeisnal

The Fouth step
In this we implement the increment operater which increment the count of the clicks
So previously what happens is we are using click++ in this what happen is there is race condition for incrementing the count of the clicks
So suppose if 1000 users click the short url at same time then the count will not be incremented correctly

So to resole the issue we are using the increment operater
const updatedDoc = await ShortUrl.findOneAndUpdate(
{ short: shortCode },
{ $inc: { clicks: 1 } },
{ new: true, runValidators: true }
);

The fifth step

In this step we implement the cache in our application
Using the redis and cluster mode

We have implemented the redis for fater read

======================================================
🚀 REDIS CACHE BENCHMARK PERFORMANCE REPORT
======================================================

- MongoDB Query Latency (Cache Miss) : 4.289 ms
- Redis Cache Latency (Cache Hit) : 0.147 ms
- Performance Improvement : 29.2x Faster!

If we can see it increase the performance 29.2x faster
i want to write more about this

For redis Url i am using upstash because it is giving us the free tier

## THIS IS THE SIXTH PHASE OF THE URL SHORTNER PROJECT.

In this step we implement the rate limiting in our application

There are four types of rate limiting we can implemnet

1. Fixed window
2. Sliding window
3. Token bucket
4. Leaky bucket

So i have implemented the sliding window rate limiting
But when i learn about the rate limiting the Token Butcket is more feasible because sliding window is little expesive and it checks every time the user make a request

But Token Butcket is not like this

Token Bucket is simple a bucket of token every request descrease 1 token adn every second one token input into the bucket and it donot increase the size of the bucket

And leacky bucket means it provide the controlled output
In abosrbs the the extra request are throw out from the bucket

But The Token Bucket provide the controlled output

and fixed window is simple every minute per request

## THIS IS THE SEVENTH PHASE OF THE URL SHORTNER PROJECT.

In this we have implemented the redis queue and To do not unblock the user when user click the short url we directly return the response

In this we have pushed the event into the queue and we have worker which will process the event

In this we simply push the click event into the redis queue
That is called producer

So why we create this ?
Because if 1000 persons click the short url at the same time then all 1000 will perform the I/O to the mongoDb backend and it slow all the 1000 request
So by implementing the queue we can handle this situation

But there is one issue not we have pushed the event to the queue but if we donot consume this queue SO it also remains in the queue
and create a bottleneck

1,000 Clicks ──► 1,000 DB Connections ──► 1,000 Disk Writes ──► High CPU & Disk I/O Bottleneck!

So to reslove this we create a consumer
Which will consume the queue and process the event

Now into the next step we create consumer

## THIS IS THE EIGHTH PHASE OF THE URL SHORTNER PROJECT.

In this i have create the cosumer that can consume the queue and process the event
and bulkwrite the result into the database

So 1000 events in 1 DB operation

1,000 Clicks ──► 1 BulkWrite Operation ──► 1 Disk Write ──► Minimal CPU & Disk I/O Load!

## THIS IS THE NINTH PHASE OF THE URL SHORTNER PROJECT.

In this phase we handle worker failure and idempotency

What happens if worker crashes while processing batch?
If worker pops event from queue and crashes before updating MongoDB then data is lost.
Or if worker retries the batch then click count is added twice.

So to resolve this we implement two things:

1. Reliable Queue (RPOPLPUSH):
When worker takes events from main queue it moves them to processing queue.
If worker crashes the remaining events in main queue are safe and in-flight events in processing queue are recovered on worker reboot.

2. Event Deduplication (Idempotency):
We attach unique eventId (UUID) to every click event.
Before processing worker checks Redis SET NX key for eventId.
If eventId is duplicate worker skips it. So click count is never added twice.

## THIS IS THE TENTH PHASE OF THE URL SHORTNER PROJECT.

In this phase we implement multiple API servers and horizontal scaling

Node.js runs on 1 single CPU core by default.
If server has 4 or 8 CPU cores then remaining cores sit idle.

So to resolve this we use Node cluster mode (src/cluster.js) and PM2 cluster.
It spawns 1 worker process per CPU core.

We also make API servers stateless.
All session state rate limits and queues are stored in Redis and MongoDB.
So user request can land on any API worker node and get same response.

We also added /health endpoint to check MongoDB Redis and queue status.

## THIS IS THE TWELFTH PHASE OF THE URL SHORTNER PROJECT.

In this phase we implement observability structured logging and request tracing

Why console.log fails in production:
1. It is synchronous and blocks the single thread Event Loop.
2. It outputs plain text which cannot be searched in Grafana or Datadog.
3. It has no request ID so you cannot trace errors across API routes and background workers.

So to resolve this we implement three things:

1. High performance Pino logger (src/utils/logger.js):
It outputs non-blocking structured JSON logs.

2. Correlation ID Middleware (X-Request-ID):
Every request gets unique requestId (UUID).
This requestId is attached to HTTP response headers and Redis queue events.

3. End-to-End Tracing:
When background worker processes click event it logs using exact same requestId.
So developers can search 1 requestId and trace whole request lifecycle from API route to Redis queue to MongoDB write.

## THIS IS THE THIRTEENTH PHASE OF THE URL SHORTNER PROJECT.

In this phase we attack our own system with high-concurrency load and chaos testing

Why we need load testing:
Before deploying to production we must test how system behaves when thousands of requests hammer the server at the same time.

We used Autocannon tool to fire 1,700+ requests with 50 concurrent virtual clients.

What we learned and optimized:

1. Redis Pipeline for Queue Consumer:
Instead of sending 1,000 separate network calls to pop events from Redis we use redis.pipeline() to pop 1,000 events in 1 network operation.

2. Redis Pipeline for Deduplication:
Instead of sending 1,000 separate SET NX locks to Redis we use pipelined batch locks in 1 network operation.

Benchmark Results under load:
- Total Requests Fired: 1,727 requests
- Throughput Rate: 345 req/sec
- Server Errors (5xx): 0
- Click Accounting Accuracy: 100% (1,777 clicks recorded in MongoDB with 0 lost events)

## THIS IS THE FASTIFY MIGRATION AND PERFORMANCE TRANSFORMATION PHASE OF THE URL SHORTNER PROJECT.

In this phase we tell the story of how we transformed our URL Shortener performance from 449 requests per second all the way to 6,809 requests per second!

First, why did we migrate from Express to Fastify?
Our initial Express.js backend was giving us around 345 to 449 requests per second. Express has higher routing overhead and middleware execution cost.
So we decided to migrate our entire backend to Fastify!

What we did in the Fastify Migration:
1. We replaced express() with Fastify() instance in src/app.js.
2. We changed controller parameters from Express (req, res) to Fastify (request, reply) methods.
3. We converted Express router objects into Fastify async plugin functions.
4. We integrated Pino structured JSON logger natively into Fastify with X-Request-ID correlation tracking.

After migrating to Fastify:
Our throughput increased from 345 req/sec to 488 req/sec (+41.4% speedup).

Now comes the big breakthrough: How did we jump from 449 req/sec to 6,809 req/sec?

Story of the 3 Performance Breakthroughs:

Breakthrough 1: Uncovering the Cloud Redis Latency Bottleneck
We noticed that even with Fastify, every request was taking around 169ms. Why?
Because we were using Upstash Cloud Redis over the public Internet WAN! Every single Redis ping was traveling across the internet taking 80ms roundtrip ping latency (RTT).
So we installed Local Redis (redis://127.0.0.1:6379).
Because Local Redis runs in RAM on the same machine, network ping latency dropped from 80ms to under 0.5ms!
This instantly boosted our response latency from 169ms down to 13ms!

Breakthrough 2: Suppressing Terminal Console Logging (LOG_LEVEL=warn)
We noticed that printing thousands of JSON log lines to the terminal screen (stdout TTY) was causing the Node.js single thread to waste CPU cycles rendering text.
By setting LOG_LEVEL=warn during high-concurrency chaos tests, Node.js spent 100% of CPU time processing HTTP requests instead of writing text to the screen!

Breakthrough 3: Redis Pipelining & High Concurrency Testing
Instead of sending individual Redis commands, we used redis.pipeline() to batch RPOPLPUSH and deduplication SET NX operations in 1 single network operation.

The Final Benchmark Performance Transformation:
- Initial Express + Cloud Redis Baseline : 345 - 449 req/sec (p99 Latency: 228 ms)
- Fastify + Cloud Redis Migration       : 488 req/sec (p99 Latency: 169 ms)
- Fastify + Local Redis + LOG_LEVEL=warn: 6,809 req/sec (p99 Latency: 13 ms)

Total Performance Speedup: Over 15x Faster Throughput (from 449 req/sec to 6,809 req/sec) with 0 Server Errors and 100% Click Accounting Accuracy in MongoDB!

## THIS IS THE TENTH PHASE OF THE URL SHORTNER PROJECT (RICH ANALYTICS PIPELINE).

In this phase we implement rich click analytics tracking for Browser OS Device and Referrer domains

Why we need rich analytics:
Previously we were only counting total clicks count ($inc: { clicks: 1 }). But enterprise platforms like Bitly need detailed analytics breakdowns like which browsers OS devices and websites are driving traffic.

What we implemented:

1. UrlAnalytics Data Model (src/models/analytics.model.js):
Created Mongoose schema for storing detailed click events with indexes on short code and timestamp.

2. User-Agent and Referrer Parser (src/utils/userAgentParser.js):
Extracted browser OS device type and referrer domains from incoming HTTP headers.

3. Dual Bulk Ingestion Background Worker (src/workers/analytics.worker.js):
Updated AnalyticsWorker to execute dual bulkWrite() operations in parallel. It updates total clicks count on ShortUrl collection and inserts rich click event records into UrlAnalytics collection.

4. Rich Analytics API Endpoint (GET /api/v1/urls/:shortUrl/analytics):
Created endpoint that runs parallel MongoDB Aggregation pipelines ($match $group $sort) to return:
- Total clicks count
- Clicks by Browser (Chrome, Safari, Firefox, Edge)
- Clicks by Operating System (Windows, macOS, Linux, iOS, Android)
- Clicks by Device Type (Desktop vs Mobile)
- Clicks by Referrer Domain (Google, Twitter, Direct, etc.)
- Recent 10 click events log

## THIS IS THE FOURTEENTH PHASE OF THE URL SHORTNER PROJECT (DOCKER CONTAINERIZATION).

In this phase we package our entire application Fastify API Redis and MongoDB into production Docker containers and orchestrate them using Docker Compose.

What we implemented:

1. Multi-Stage Dockerfile:
Created Dockerfile using Node 20 Alpine Linux base. Used multi-stage build to isolate npm build dependencies from final production runtime. Configured non-root user execution and health check probes.

2. Build Context Optimization (.dockerignore):
Excluded node_modules documentation test files and temporary artifacts to ensure small context size and fast image build.

3. Multi-Container Orchestration (docker-compose.yml):
Configured service mesh with 3 containers:
- mongodb: Mongo 6 database container with persistent volume storage.
- redis: Redis 7 in-memory cache and queue container with persistent volume.
- app: Fastify Node.js API container configured with service_healthy dependencies on MongoDB and Redis.

## THIS IS THE FIFTEENTH PHASE OF THE URL SHORTNER PROJECT (NEXT.JS MINIMALIST FRONTEND).

In this phase we built an ultra-fast minimalist frontend application using Next.js App Router Zustand and Axios.

What we implemented:

1. Environment Configuration (client/.env.local):
Created .env.local storing NEXT_PUBLIC_API_URL=http://localhost:5000 so the server URL is never hardcoded inside components. All Axios calls read from this environment variable automatically.

2. Axios Client Integration (client/lib/axios.js):
Configured a central Axios instance with base URL from env, JSON content-type header, and a 10-second request timeout. Every API call across the app shares this single configured client.

3. Zustand State Management (client/store/useUrlStore.js):
Created a Zustand store as the single source of truth for:
- urls: full list of active short links
- recentUrl: the just-created link for the instant result card
- analyticsData and isAnalyticsOpen: modal state and aggregation results
- copySuccessId: tracks which link triggered the copy-success animation
- loading and error: global request states
Actions include fetchUrls(), createShortUrl(), fetchAnalytics(), closeAnalytics(), setCopySuccessId(), and clearError().

4. CORS Fix on Fastify Backend (src/app.js):
The first issue we faced after starting the frontend was AxiosError: Network Error in the browser console. The root cause was that the browser blocked all requests from http://localhost:3000 (Next.js) to http://localhost:5000 (Fastify) because Fastify had no CORS headers. We installed @fastify/cors and registered it with origin: true so all cross-origin browser requests are allowed in development.

5. Design System (client/app/globals.css):
Implemented Inter Google Font typography with PostCSS and Tailwind CSS v4 (@import "tailwindcss"). Defined CSS custom property tokens for the full color palette, border radiuses, box shadows, and animations (fade-up, spin, blink, slide-in).

6. Component Architecture:
All UI lives inside client/app/page.js as co-located sub-components sharing a C tokens object. This avoids prop drilling and makes global palette changes a single-line edit.
- Header: Sticky frosted glass nav bar with indigo brand icon and live status chip
- UrlShortenerForm: Input with focus ring, Shorten button, DNS validation badge, and instant result card
- UrlList: Stacked card list per short link showing short code pill, click counter, Copy and Analytics buttons
- AnalyticsModal: Full-screen blurred overlay with stat cards, indigo progress bars per breakdown category, and recent activity log


## THIS IS THE SIXTEENTH PHASE OF THE URL SHORTNER PROJECT (DESIGN ITERATION - INDIGO/SLATE PALETTE).

After the initial grey-only design the interface did not feel modern enough. We did a complete redesign replacing the grey-only palette with an Indigo and Slate design system inspired by Linear, Vercel, and Supabase.

New color palette:
- Background: #F1F5F9 (slate-100)
- Surface cards: #FFFFFF
- Raised elements: #F8FAFC
- Primary accent: #6366F1 (indigo-500)
- Primary dark: #4F46E5 (indigo-600)
- Accent tint: #EEF2FF (indigo-50)
- Text primary: #0F172A (slate-900)
- Text muted: #64748B (slate-500)

Design improvements made:
- Hero heading with CSS gradient text (indigo to indigo-dark) on "instantly."
- Indigo gradient Shorten button with colored drop shadow
- Input focus ring glows indigo (#EEF2FF background + #C7D2FE border)
- Short code pill styled in indigo tint instead of plain grey
- Analytics progress bars replaced solid grey with indigo gradient
- Analytics modal backdrop is blurred dark overlay with slide-in animation
- Feature chips in nav with indigo icons


## THIS IS THE SEVENTEENTH PHASE OF THE URL SHORTNER PROJECT (CLOUDFLARE DNS-OVER-HTTPS URL VALIDATOR).

In this phase we implemented a frontend-only real-time URL domain validation feature. The goal was to detect whether a user-typed URL like gooooooogle.com actually exists in DNS before the user submits the form, without touching the backend at all.

The Problem:
A standard URL regex can validate syntax (does it look like a URL?) but cannot detect whether the domain actually exists. gooooooogle.com is syntactically valid but has no DNS records. The only way to check this from the browser is to perform a real DNS lookup.

Why the Browser Cannot Do DNS Directly:
Browsers cannot call OS-level DNS resolvers from JavaScript. They only speak HTTP. However Cloudflare provides a public DNS-over-HTTPS (DoH) API that accepts standard browser fetch() requests and returns DNS query results as JSON.

Cloudflare DNS-over-HTTPS API:
Endpoint: https://cloudflare-dns.com/dns-query?name=<hostname>&type=A
Required Header: Accept: application/dns-json

DNS Status Codes returned:
- Status 0 (NOERROR) + Answer array with records = domain exists and resolves (VALID)
- Status 3 (NXDOMAIN) = domain does not exist in global DNS (INVALID)
- Status 2 (SERVFAIL) or network error = cannot verify (UNKNOWN)

Example queries:
- google.com -> Status 0, 4 A records -> VALID (domain resolves)
- gooooooogle.com -> Status 3 NXDOMAIN -> INVALID (domain not found)
- localhost -> Status 3 or no records -> INVALID or UNKNOWN

How We Implemented It (client/lib/urlValidator.js):

1. extractHostname(rawInput):
Uses the browser's built-in URL() constructor to parse any user-typed string (with or without https://) and extract a clean lowercase hostname. Returns null if the input cannot be parsed.

2. checkDomainResolvable(hostname):
Makes a fetch() call to the Cloudflare DoH endpoint with a 4-second AbortController timeout. Checks the Status field in the JSON response. If Status 0 with no A records it falls back to querying AAAA (IPv6) records as some domains are IPv6-only. Returns 'valid', 'invalid', or 'unknown'.

3. debounce(fn, delay):
A standard debounce wrapper so we only send DNS queries after the user stops typing for 600ms. Without this we would send dozens of queries per second on each keystroke.

Race Condition Safety:
We store the latest queried hostname in a useRef. When the async DNS response arrives we compare the hostname in the response to the ref. If the user has already typed something new and a newer query is in flight we discard the stale result. This prevents old slow responses from overwriting newer faster responses.

UI Integration in UrlShortenerForm:
- Validation state: idle | checking | valid | invalid | unknown
- Each state renders a small badge below the input with a matching icon and color
- checking: grey spinner badge
- valid: green CheckCircle badge (Domain resolves)
- invalid: red XCircle badge (Domain not found) + soft hint text
- unknown: amber HelpCircle badge (Could not verify)
- The input border also changes color to match: green tint on valid, red tint on invalid
- The Shorten button is NEVER blocked by validation. The feature is purely informational. The user can still shorten an invalid domain if they choose.


## THIS IS THE EIGHTEENTH PHASE OF THE URL SHORTNER PROJECT (CUSTOM FAVICON).

Replaced the default Vercel triangle favicon with a custom SVG icon designed to match the FastUrl brand.

The favicon is a chain-link icon (two overlapping rounded rectangles connected by a line) on an indigo gradient background (#6366F1 to #4F46E5) matching the primary accent color of the UI.

Why SVG for a favicon:
SVG favicons are resolution-independent. A single SVG file renders perfectly crisp at 16x16 in browser tabs, 32x32 in taskbars, 180x180 as Apple touch icons, and any other size. No need to generate multiple PNG files at different resolutions.

Files created:
- client/app/icon.svg: Next.js App Router automatically detects any file named icon.* in the app/ directory and serves it as the favicon metadata. No configuration needed.
- client/public/icon.svg: Copied here so the explicit <link rel="icon"> href="/icon.svg" in layout.js resolves correctly.
- client/app/layout.js: Added metadata.icons configuration and <link rel="icon"> tag in the <head> for maximum browser compatibility.




