# From a Simple CRUD URL Shortener to a Production-Grade System Handling 6,800+ Requests/Second

### How I took an old Express + EJS project and pushed it through concurrency, caching, queues, Fastify, clustering, observability, Docker, load testing, and finally a modern Next.js frontend.

One night, I was sitting and thinking about my journey as a developer.

I knew how to code.

I had built APIs.

I had worked with Node.js, Express, MongoDB, React, and other technologies.

But there was something I wasn't confident about.

**Building software.**

I could build CRUD applications.

Create a record.

Read a record.

Update a record.

Delete a record.

But I kept wondering:

> **Is building CRUD applications enough to understand how real software works?**

So I started searching.

I wanted to know what engineers actually build beyond basic CRUD.

That search eventually led me to something very familiar:

**URL Shorteners.**

I had already built one.

My old project was a simple URL shortener built with:

- Node.js
- Express
- EJS
- MongoDB

It worked.

You entered a long URL, the application generated a short code, and visiting that short URL redirected you to the original URL.

From a feature perspective, there wasn't much left to do.

But I started asking different questions.

> What happens if thousands of users request the same short URL at the same time?

> What happens if two requests update the click counter simultaneously?

> What happens if MongoDB has millions of documents?

> What happens if Redis is far away from my server?

> What happens if an analytics worker crashes?

> What happens if the same event is processed twice?

> What happens if one CPU core isn't enough?

> How do I know whether my optimization actually worked?

Those questions completely changed the project.

I wasn't trying to build another URL shortener anymore.

I was trying to understand **how to turn a simple application into a system that can handle real engineering problems.**

---

# The Starting Point

My original architecture was extremely simple:

```text
Browser
   ↓
Express
   ↓
MongoDB
   ↓
EJS
```

The redirect logic was basically:

```javascript
app.get("/:shortUrl", async (req, res) => {
  const shortUrl = await ShortUrl.findOne({
    short: req.params.shortUrl,
  });

  if (!shortUrl) {
    return res.sendStatus(404);
  }

  shortUrl.clicks++;

  await shortUrl.save();

  res.redirect(shortUrl.full);
});
```

For a small application, this is completely reasonable.

The problem wasn't that the code was bad.

The problem was that I had never pushed it hard enough to discover where it would fail.

So I decided to do exactly that.

---

# Phase 1 — Creating Better Boundaries

The first thing I realized was that the application mixed too many responsibilities together.

Routes were handling HTTP logic.

Controllers were handling business logic.

Database operations were happening directly inside request handlers.

As long as the application was small, this wasn't a major issue.

But I knew I would need to replace and optimize individual pieces.

So I introduced clearer layers:

```text
Request
   ↓
Route
   ↓
Controller
   ↓
Service
   ↓
Model
   ↓
MongoDB
```

This wasn't about creating folders just for the sake of architecture.

The purpose was to create boundaries.

I wanted to be able to change the database logic without rewriting the HTTP layer.

I wanted to introduce Redis without scattering Redis code throughout the application.

I wanted the analytics system to evolve independently of the redirect path.

This became the foundation for everything that followed.

---

# Phase 2 — Teaching MongoDB How to Find Data

The most important operation in a URL shortener is:

```text
shortCode → original URL
```

Imagine having millions of URLs in MongoDB.

If MongoDB has to inspect document after document to find the matching short code, the application won't scale well.

That's where indexes become important.

I added indexes for the fields that were frequently queried.

For example:

```javascript
urlSchema.index(
  { short: 1 },
  {
    unique: true,
    name: "idx_short_code",
  },
);
```

I also added indexes for other important access patterns such as the original URL and creation time.

The idea was simple:

Without an index:

```text
Query
 ↓
Collection Scan
 ↓
Check many documents
 ↓
Find result
```

With an index:

```text
Query
 ↓
Index
 ↓
Find matching document
```

During testing, the difference was significant.

The query went from examining tens of thousands of documents to effectively locating the required document directly.

This taught me an important lesson:

> **A query being correct doesn't mean the query is efficient.**

You have to understand what the database is actually doing.

---

# Phase 3 — Discovering a Concurrency Bug

Then I encountered a much more interesting problem.

The URL shortener needed to count clicks.

My initial approach was:

```javascript
const doc = await ShortUrl.findOne({
  short: shortCode,
});

doc.clicks = doc.clicks + 1;

await doc.save();
```

It works perfectly when one request arrives.

But what happens when two requests arrive at almost exactly the same time?

Suppose the current click count is:

```text
10
```

Request A reads:

```text
10
```

Request B also reads:

```text
10
```

Then both increment their local value:

```text
A → 11
B → 11
```

The database may finally contain:

```text
11
```

But two clicks actually happened.

The expected value is:

```text
12
```

This is a race condition.

The problem wasn't JavaScript syntax.

The problem was that the operation wasn't atomic.

So I moved the increment into MongoDB:

```javascript
await ShortUrl.findOneAndUpdate(
  { short: shortCode },
  { $inc: { clicks: 1 } },
  {
    new: true,
    runValidators: true,
  },
);
```

Now MongoDB performs the increment atomically.

This was one of the first moments where I understood something important:

> **Code that works for one user can still be incorrect for many concurrent users.**

---

# Phase 4 — Redis Caching

Next, I looked at the redirect path.

A URL shortener is heavily read-oriented.

If thousands of users request the same short code, why should MongoDB answer the same question thousands of times?

So I introduced Redis as a cache.

The flow became:

```text
Request
   ↓
Redis
   │
   ├── Cache Hit → Original URL
   │
   └── Cache Miss
          ↓
       MongoDB
          ↓
       Redis
          ↓
       Original URL
```

MongoDB remained the source of truth.

Redis simply provided a faster access layer.

The measured read-path timings were approximately:

```text
MongoDB → 4.289 ms
Redis   → 0.147 ms
```

That's roughly a **29× difference** in the measured path.

But this optimization introduced another lesson.

Redis itself was fast.

The network connection to Redis wasn't.

And I wouldn't discover the full impact of that until the benchmarking stage.

---

# Phase 5 — Protecting the API With Rate Limiting

A public URL shortener shouldn't accept unlimited requests from every client.

A malicious or overly aggressive client could generate a huge number of requests.

So I introduced Redis-backed rate limiting.

I used a token bucket approach.

The configuration was:

```text
Bucket capacity: 100 tokens
Refill rate:     10 tokens/sec
```

Conceptually:

```text
Request
   ↓
Token Bucket
   │
   ├── Token available → Allow
   │
   └── No token → HTTP 429
```

The important thing here wasn't simply implementing rate limiting.

It was understanding why it belongs in the system.

A production service needs to think about:

> **What happens when clients don't behave nicely?**

Performance without protection isn't enough.

---

# Phase 6 — Moving Analytics Out of the Critical Path

Then I looked at the redirect process again.

When somebody clicks a short URL, the user primarily needs one thing:

```text
The destination URL.
```

The system also needs to record:

```text
A click happened.
```

Those two operations don't have to block each other.

A synchronous design might look like:

```text
Request
   ↓
Find URL
   ↓
Update click count
   ↓
Store analytics
   ↓
Redirect
```

That means the user waits for database work.

I wanted the redirect path to be much faster.

So I changed it to:

```text
Request
   ↓
Find URL
   ↓
Queue analytics event
   ↓
302 Redirect
```

And separately:

```text
Redis Queue
   ↓
Analytics Worker
   ↓
MongoDB
```

This introduced asynchronous processing.

The user gets the redirect quickly while analytics processing happens in the background.

The principle was:

> **If work doesn't need to block the user, don't put it in the critical path.**

---

# Phase 7 — Building a Queue With Redis

Since Redis was already part of the architecture, I used it for the analytics queue.

The architecture became:

```text
HTTP Request
     ↓
Redis Queue
     ↓
Analytics Worker
     ↓
MongoDB
```

Instead of immediately performing an individual database operation for every click, events could be accumulated and processed in batches.

The worker could process up to 1,000 events in a batch using MongoDB's `bulkWrite()`.

Conceptually:

```text
1,000 click events
       ↓
Redis
       ↓
Worker
       ↓
bulkWrite()
       ↓
MongoDB
```

This reduces the number of individual database operations.

But asynchronous systems introduce a difficult question:

> **What happens when the worker crashes?**

---

# Phase 8 — Crash Recovery and Idempotency

Imagine the worker receives an event.

It processes the event.

Then it crashes before the queue state is safely updated.

If the event disappears, we lose analytics.

So I introduced a processing queue using Redis operations such as:

```text
RPOPLPUSH
```

The conceptual flow became:

```text
Main Queue
    ↓
Processing Queue
    ↓
Worker
```

If the worker crashes, stranded events can be recovered.

But now another problem appears.

What if the same event is processed twice?

For example:

```text
Click Event
    ↓
MongoDB updated
    ↓
Worker crashes
    ↓
Event recovered
    ↓
MongoDB updated again
```

One click could become two.

So every analytics event receives a unique:

```text
eventId
```

I then use Redis's conditional set operation:

```text
SET lock:event:<eventId> EX 86400 NX
```

The `NX` condition ensures that the lock is created only if it doesn't already exist.

This gives me duplicate protection.

The architecture now has two important properties:

```text
RPOPLPUSH
    ↓
Crash recovery
```

and:

```text
SET NX
    ↓
Duplicate protection
```

This was a major shift in how I thought about software.

I stopped asking only:

> “Does the happy path work?”

And started asking:

> **“What happens when something fails halfway through?”**

---

# Phase 9 — Express to Fastify

At this point, the application was functionally much more capable.

Now I wanted to improve the HTTP layer itself.

This was the first major performance optimization.

The original backend used:

```text
Express
```

I migrated the API to:

```text
Fastify
```

The reason wasn't simply:

> “Fastify is faster.”

I wanted to benchmark the actual difference in my application.

The baseline benchmark was approximately:

```text
Express + Cloud Redis

345 req/sec
228 ms p99 latency
```

After migrating to Fastify:

```text
Fastify + Cloud Redis

488 req/sec
169 ms p99 latency
```

That's approximately:

```text
41.4% higher throughput
```

under the same recorded benchmark conditions.

The important lesson:

> **Don't treat framework benchmarks as your application's benchmark.**

A framework may have impressive benchmark numbers, but what matters is how your entire system behaves.

---

# Phase 10 — Using Multiple CPU Cores

Fastify improved the HTTP layer.

But I also wanted the application to make better use of the available CPU.

Node.js runs JavaScript primarily on a single event loop.

If the machine has multiple CPU cores, I wanted multiple application processes to be able to handle traffic.

So I introduced process clustering using:

```javascript
child_process.fork();
```

The architecture became:

```text
                  Incoming Requests
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      Fastify          Fastify        Fastify
      Worker 1         Worker 2       Worker 3
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                    Shared Redis
                         │
                         ▼
                     MongoDB
```

The workers don't keep important shared state in memory.

Shared state lives in infrastructure such as:

```text
Redis
MongoDB
```

That allows requests to be handled by different workers without depending on a particular process's memory.

I also caught a small configuration issue during this stage.

Environment variables are strings.

So:

```javascript
process.env.WORKERS_COUNT;
```

needs to be converted explicitly when used as a number:

```javascript
parseInt(process.env.WORKERS_COUNT, 10);
```

It was a small detail, but it reinforced another lesson:

> **Production engineering is often about catching small assumptions before they become large problems.**

---

# Phase 11 — Observability

Once multiple processes and background workers existed, debugging became harder.

Imagine a request travelling through:

```text
Browser
   ↓
Fastify Worker
   ↓
Redis
   ↓
Analytics Worker
   ↓
MongoDB
```

If something goes wrong, how do you connect all those events?

That's where observability became important.

I introduced structured logging with Pino and request correlation.

Each request gets a request ID:

```text
X-Request-ID
```

That identifier can then be associated with the work performed by the system.

Instead of logs being random messages, I can trace the path of a request.

For example:

```json
{
  "reqId": "req-3ff22038",
  "msg": "GET /uaW8FMy HTTP 302"
}
```

This becomes much more useful when debugging distributed work.

The lesson:

> **Logs should help you reconstruct what happened, not just tell you that something happened.**

---

# Phase 12 — Dockerizing the Backend

By this point, the backend was no longer just:

```text
Node.js + MongoDB
```

It had become:

```text
Fastify API
Fastify workers
Redis
MongoDB
Analytics Worker
Queues
Rate Limiting
Caching
Environment configuration
```

Manually reproducing this environment was becoming part of the complexity.

So Docker became the final stage of the backend transformation.

The system could now be represented as multiple services:

```text
                    Docker Environment
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     Fastify API         Redis           MongoDB
     Workers               │
          │                │
          └────────┬───────┘
                   ▼
            Analytics Worker
```

Docker gave each component an isolated and reproducible environment.

Docker Compose made it easier to define how those services work together.

The important lesson wasn't simply:

> “I learned Docker.”

It was:

> **The environment in which software runs is part of the software.**

When your application depends on multiple services, reproducibility becomes an engineering concern.

---

# Now I Needed Proof

At this point, I had added a lot of technology.

But technology isn't the goal.

Performance isn't:

> “I added Redis.”

Performance is:

> **“What happened after I added Redis?”**

So I started benchmarking the system.

I used AutoCannon to generate concurrent HTTP traffic.

And that's when the project became really interesting.

---

# Optimization #1 — Express → Fastify

My baseline:

```text
Express + Cloud Redis

345 req/sec
228 ms p99
```

After migrating to Fastify:

```text
Fastify + Cloud Redis

488 req/sec
169 ms p99
```

The result:

```text
~41.4% higher throughput
```

Fastify helped.

But the system was still far from where I wanted it to be.

So I looked deeper.

---

# Optimization #2 — Finding the Network Bottleneck

Earlier, I had introduced Redis.

I assumed Redis was making the system faster.

It was.

But during the benchmark, I discovered something unexpected.

The application was communicating with a cloud Redis instance.

So the request path looked roughly like:

```text
Application
    ↓
Network
    ↓
Cloud Redis
    ↓
Network
    ↓
Application
```

The network round trip was becoming expensive.

The measured latency was around:

```text
~80 ms
```

for the relevant path.

So I switched the benchmark environment to local Redis:

```text
redis://127.0.0.1:6379
```

Now the relevant network latency dropped dramatically:

```text
~80 ms
    ↓
< 0.5 ms
```

The application's p99 latency then dropped from approximately:

```text
169 ms
    ↓
13 ms
```

This was probably my biggest performance lesson.

> **The bottleneck isn't always the service. Sometimes the bottleneck is the network between services.**

I could have spent hours optimizing JavaScript.

I could have rewritten database queries.

But the biggest issue was sitting between my application and Redis.

---

# Optimization #3 — Reducing Excessive Logging

Then I found another unexpected bottleneck.

During high-concurrency testing, I was producing a large amount of JSON logging in the terminal.

The application was spending CPU cycles not only serving requests, but also formatting and writing logs.

During my benchmark measurements, terminal logging was consuming a significant portion of Node.js CPU time.

So I reduced the benchmark logging level:

```text
LOG_LEVEL=warn
```

This allowed more CPU resources to be spent on actual request processing.

Another lesson:

> **Even your debugging tools can become part of the performance problem.**

---

# The Final Benchmark

The recorded progression looked like this:

| Configuration                           |        Throughput | p99 Latency | Relative Throughput |
| --------------------------------------- | ----------------: | ----------: | ------------------: |
| Express + Cloud Redis                   |       345 req/sec |      228 ms |                  1× |
| Fastify + Cloud Redis                   |       488 req/sec |      169 ms |               1.41× |
| Fastify + Local Redis + Reduced Logging | **6,809 req/sec** |   **13 ms** |           **19.7×** |

The final recorded result was:

# **6,809 requests/second**

with:

# **13 ms p99 latency**

But there is an important caveat.

This doesn't mean:

> “My URL shortener can handle exactly 6,809 requests every second in production.”

Benchmark results depend on:

- CPU
- Memory
- Network
- Redis location
- MongoDB configuration
- Concurrency
- Request characteristics
- Benchmark configuration

So I consider this a benchmark result, not a universal production capacity claim.

What matters to me is the comparison.

Under my recorded conditions, the optimized system handled almost **20× the throughput** of the original baseline.

---

# Phase 13 — Building Real Analytics

Now that the backend could process clicks asynchronously, I wanted to make those events useful.

Instead of only storing:

```text
clicks = 100
```

I wanted analytics around:

- Browser
- Operating system
- Device
- Referrer
- Timestamp
- IP information

An analytics event could contain information such as:

```text
eventId
shortCode
user-agent
referer
IP
timestamp
requestId
```

The worker could then store those events and MongoDB aggregation pipelines could turn them into useful summaries.

For example:

```json
{
  "short": "x6t3p6E",
  "totalClicks": 10,
  "breakdown": {
    "browsers": [
      {
        "browser": "Chrome",
        "clicks": 4
      },
      {
        "browser": "Safari",
        "clicks": 4
      },
      {
        "browser": "Firefox",
        "clicks": 2
      }
    ],
    "devices": [
      {
        "device": "Desktop",
        "clicks": 6
      },
      {
        "device": "Mobile",
        "clicks": 4
      }
    ]
  }
}
```

The project had now evolved from a URL shortener into a small analytics system.

But there was one major thing missing.

The frontend.

---

# Phase 14 — Moving From EJS to Next.js

The original project used EJS.

It was perfect for the first version.

But after evolving the backend, I wanted a frontend that felt like a real product.

So I built a new frontend using:

- Next.js
- App Router
- Zustand
- Axios
- Tailwind CSS

The architecture became:

```text
                    Browser
                       │
                       ▼
                Next.js Application
                       │
                Axios API Client
                       │
                       ▼
                  Fastify API
                       │
              ┌────────┴────────┐
              ▼                 ▼
           Redis             MongoDB
```

The goal wasn't to expose the complexity of the backend.

The goal was to hide that complexity behind a simple interface.

---

# Phase 15 — Environment Configuration

I didn't want API URLs hardcoded throughout the frontend.

So I created:

```text
client/.env.local
```

with:

```text
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Now API configuration comes from the environment.

That means changing the backend URL doesn't require modifying individual components.

This is a small decision, but it becomes increasingly useful as the application moves between development, staging, and production environments.

---

# Phase 16 — A Central Axios Client

Instead of configuring Axios separately in every component, I created a central Axios instance.

The client contains:

```text
Base URL
JSON content type
10-second timeout
```

Conceptually:

```javascript
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});
```

Now all API requests use the same client.

Again, the goal is consistency.

> **Configuration should have a single home whenever possible.**

---

# Phase 17 — Zustand for Application State

The frontend started accumulating state:

```text
URLs
Recent URL
Analytics data
Analytics modal
Copy status
Loading
Errors
```

Instead of passing all of this state between components, I introduced Zustand.

The store became the central source of truth.

It manages:

```text
urls
recentUrl
analyticsData
isAnalyticsOpen
copySuccessId
loading
error
```

And exposes actions such as:

```text
fetchUrls()
createShortUrl()
fetchAnalytics()
closeAnalytics()
setCopySuccessId()
clearError()
```

This made the frontend data flow much easier to reason about.

The principle was the same as the backend architecture:

> **Separate responsibilities before complexity forces you to.**

---

# Phase 18 — The First Frontend Problem: CORS

Once the frontend started talking to the backend, I encountered:

```text
AxiosError: Network Error
```

The problem wasn't Axios.

The frontend was running on:

```text
http://localhost:3000
```

while the backend was running on:

```text
http://localhost:5000
```

These are different origins.

The browser therefore enforced its cross-origin security rules.

The Fastify server didn't have the required CORS headers.

So I added:

```text
@fastify/cors
```

and configured it for the development environment.

After that, the browser could communicate with the API.

This was a good reminder that full-stack development isn't simply:

```text
Frontend + Backend
```

It's also about understanding the browser's security model and the network between the two.

---

# Phase 19 — Designing the Product

The first frontend worked.

But it didn't feel like a product yet.

So I built a small design system around:

- Inter typography
- Tailwind CSS
- CSS custom properties
- Consistent border radiuses
- Shadows
- Animations
- Reusable visual tokens

The interface contains four major pieces.

### Header

A sticky frosted-glass navigation bar with:

- FastUrl branding
- Indigo icon
- Live status indicator

### URL Shortener Form

The main interaction:

```text
Long URL
   ↓
Shorten
   ↓
Instant Result
```

### URL List

Each short URL appears in a card with:

- Short code
- Click count
- Copy button
- Analytics button

### Analytics Modal

A full-screen modal displaying:

- Statistics
- Category breakdowns
- Progress bars
- Recent activity

The goal wasn't to build a complicated interface.

It was to make a complicated backend feel simple.

---

# Phase 20 — The Indigo/Slate Redesign

The first interface was mostly grey.

It worked.

But it didn't feel modern enough.

So I redesigned the interface around an Indigo/Slate palette.

The main design tokens became:

```text
Background       #F1F5F9
Surface          #FFFFFF
Raised Surface   #F8FAFC
Primary          #6366F1
Primary Dark     #4F46E5
Accent Tint      #EEF2FF
Text             #0F172A
Muted Text       #64748B
```

I also redesigned the important interactions.

The hero heading uses gradient text.

The Shorten button uses an indigo gradient.

The input gets an indigo focus glow.

Short codes use indigo pills.

Analytics progress bars use an indigo gradient.

The modal uses a blurred backdrop and slide-in animation.

The navigation contains feature chips with indigo icons.

The result is still minimalist.

But now the visual language matches the product.

---

# Phase 21 — DNS Validation With DNS-over-HTTPS

Then I added something that wasn't strictly necessary for shortening URLs.

I wanted to improve the user experience.

Imagine someone types:

```text
gooooooogle.com
```

A URL regex can tell us that it looks like a valid URL.

But syntax doesn't tell us whether the domain actually exists.

So I wanted the frontend to perform a real DNS check.

Browsers cannot directly perform arbitrary OS-level DNS queries from JavaScript.

But Cloudflare provides a public DNS-over-HTTPS API.

So the frontend can perform a DNS query through HTTPS.

The flow became:

```text
User enters URL
       ↓
Extract hostname
       ↓
Cloudflare DNS-over-HTTPS
       ↓
DNS response
       ↓
VALID / INVALID / UNKNOWN
```

The validator understands three states.

### Valid

The domain resolves.

### Invalid

The DNS response indicates `NXDOMAIN`.

### Unknown

The request fails or DNS cannot be confidently verified.

---

# Phase 22 — Debouncing DNS Requests

There was another problem.

Users don't type an entire URL at once.

They type:

```text
g
go
goo
gooo
goooo
...
```

If I performed a DNS query on every keystroke, the browser could generate a huge number of unnecessary requests.

So I added a:

```text
600 ms debounce
```

Now the frontend waits until the user pauses typing.

```text
User typing
    ↓
600 ms pause
    ↓
DNS query
```

This reduces unnecessary requests and makes the validation feature much more efficient.

---

# Phase 23 — Another Race Condition

The DNS validator introduced another interesting concurrency problem.

Suppose the user enters:

```text
google.com
```

and then immediately changes it to:

```text
github.com
```

The first DNS request might be slower.

It could return after the second request.

Without protection:

```text
google.com response
        ↓
overwrites
        ↓
github.com state
```

That would be wrong.

So I stored the latest hostname using a `useRef`.

When an asynchronous response arrives, I check whether it still belongs to the current hostname.

If not, I discard it.

Conceptually:

```text
Request A → google.com
Request B → github.com

B finishes
   ↓
Update state

A finishes later
   ↓
Stale response
   ↓
Discard
```

This was interesting because I had already encountered race conditions in the backend.

Now I was dealing with one in the frontend.

The lesson was the same:

> **Asynchronous systems create race conditions everywhere.**

---

# Phase 24 — DNS Validation Doesn't Block the User

One design decision was intentional.

DNS validation is informational.

If the domain can't be verified, I don't disable the Shorten button.

Why?

Because:

```text
DNS validation
```

and:

```text
Permission to create a short URL
```

are two different concerns.

The frontend provides useful feedback.

The backend remains responsible for the actual operation.

This keeps the UI helpful without making it unnecessarily restrictive.

---

# Phase 25 — The Final Touch: Custom Favicon

There was one tiny detail left.

The browser tab was still showing the default Vercel triangle.

So I created a custom SVG favicon for FastUrl.

The icon uses a chain-link design with the same indigo visual language as the application.

I chose SVG because it is resolution-independent.

Instead of maintaining multiple raster images, one SVG can remain crisp across different sizes.

With Next.js App Router, I added:

```text
client/app/icon.svg
```

and also configured the favicon metadata for broader compatibility.

It was a small change.

But that's the point.

Once the core engineering problems were solved, I started caring about the small product details too.

---

# The Final Architecture

What started as:

```text
Express
   ↓
MongoDB
   ↓
EJS
```

eventually became:

```text
                              Browser
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Next.js App   │
                        │                 │
                        │ Zustand         │
                        │ Axios           │
                        │ Tailwind        │
                        │ DNS Validation  │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Fastify Workers │
                        │                 │
                        │ Rate Limiting   │
                        │ Redis Cache     │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
                  Redis                  MongoDB
                    │
                    ▼
             Analytics Queue
                    │
                    ▼
             Analytics Worker
                    │
                    ▼
                MongoDB
```

And the entire backend environment could be reproduced using Docker.

The project had gone from a simple CRUD application to a system containing:

- Layered architecture
- MongoDB indexing
- Atomic operations
- Redis caching
- Rate limiting
- Token bucket
- Asynchronous processing
- Redis queues
- Crash recovery
- Idempotency
- Fastify
- Multi-process clustering
- Structured logging
- Request correlation
- Docker
- Load testing
- Analytics
- Next.js
- Zustand
- Axios
- CORS
- DNS-over-HTTPS
- Debouncing
- Frontend race-condition handling
- Product-focused UI

---

# What This Project Actually Taught Me

The technology list is long.

But the technology isn't the most important part.

The important part is how my questions changed.

---

## 1. Don't Optimize What You Haven't Measured

I could have assumed MongoDB was the bottleneck.

It wasn't always.

I could have assumed Redis was slow.

Redis itself was fast.

The network connection to Redis was the problem.

Then I discovered excessive logging was consuming CPU during benchmarks.

Without measurement, I would have optimized the wrong things.

---

## 2. Every Optimization Creates New Problems

Redis improved read performance.

But now I had caching to reason about.

Queues removed analytics work from the request path.

But now I needed crash recovery.

Crash recovery introduced duplicate processing concerns.

So I needed idempotency.

Clustering allowed multiple CPU cores to participate.

But now the application needed to remain stateless.

Docker made the environment reproducible.

But now I had multiple services that needed to work together.

DNS validation improved the frontend.

But now I needed debouncing, timeouts, and stale-response protection.

This pattern kept repeating.

> **Engineering isn't about eliminating every problem. It's about understanding the new problems your decisions create.**

---

# 3. Concurrency Changes the Meaning of Correctness

One request can make code look correct.

Multiple concurrent requests can expose problems that aren't visible in sequential execution.

The click counter taught me this.

The DNS validator taught me this again.

The queue taught me this from another direction.

Concurrency isn't just about making things faster.

It's about making sure the system remains correct when multiple things happen simultaneously.

---

# 4. Performance Is a System Property

Before this project, I thought performance mostly meant:

```text
Fast code
```

Now I think about:

```text
Performance
    =
Code
+ Database
+ Cache
+ Network
+ CPU
+ I/O
+ Logging
+ Architecture
```

A fast application can still be slow because of the network.

A fast database doesn't help if the application performs unnecessary synchronous work.

A high-throughput API isn't useful if background workers lose data.

Performance belongs to the entire system.

---

# 5. Docker Made the Environment Part of the Project

Docker wasn't necessary for the first version.

It became useful after the system became more complex.

Once I had:

```text
Fastify
Redis
MongoDB
Workers
Environment configuration
```

I needed a reliable way to reproduce the environment.

That changed how I think about deployment.

The source code isn't the entire application.

The runtime environment is part of it too.

---

# 6. A Complicated Backend Should Feel Simple to the User

The backend became increasingly complicated.

The frontend shouldn't.

A user doesn't care that the redirect was served through a Fastify worker.

They don't care that analytics went through Redis.

They don't care that an event has an idempotency key.

They care about:

```text
Give me a short URL.
Show me my URLs.
Tell me how they're performing.
```

That's why I wanted the frontend to stay simple.

> **Good product design hides unnecessary complexity instead of exposing it.**

---

# From CRUD to Engineering

When I started this project, I thought my problem was that I needed to build more complicated projects.

Now I think the problem was different.

I wasn't asking difficult enough questions about the projects I had already built.

CRUD isn't bad.

CRUD is everywhere.

The problem is thinking that CRUD is the end of software engineering.

The interesting questions begin after the basic feature works.

```text
What happens when two requests update the same data?

What happens when traffic increases?

What happens when the database becomes slow?

What happens when Redis is far away?

What happens when a worker crashes?

What happens when an event is processed twice?

What happens when one CPU core isn't enough?

What happens when I need to trace a request?

What happens when I need a reproducible environment?

What happens when the browser blocks my API?

What happens when an asynchronous response becomes stale?

How do I know my optimization actually worked?
```

Those questions took this project much further than another CRUD tutorial could have.

---

# Building a Project vs Engineering a System

My original URL shortener answered one question:

> **Can I shorten a URL?**

The final system forced me to answer much harder questions:

> **Can I serve it quickly?**

> **Can I handle concurrent requests correctly?**

> **Can I protect the service from abusive traffic?**

> **Can I move unnecessary work out of the critical path?**

> **Can I recover if a worker crashes?**

> **Can I prevent duplicate processing?**

> **Can I use multiple CPU cores?**

> **Can I trace what happened inside the system?**

> **Can I reproduce the environment?**

> **Can I measure whether my changes actually improved performance?**

> **Can I build a frontend that hides all this complexity from the user?**

Those are the questions I was looking for when I started this project.

Not another project that I could simply say:

> **“I built it.”**

But a project that forced me to understand:

> **“Why does this system work?”**

---

# Final Thoughts

I don't think everyone needs to build a 6,800 req/sec URL shortener.

That's not the lesson.

The lesson is that you can take almost any simple application and use it to learn deeper engineering concepts.

Start simple.

Then keep asking difficult questions.

```text
What breaks?

Why does it break?

How can I measure it?

What is the bottleneck?

What trade-off does the solution introduce?

What happens when the solution fails?

Can I recover?

Can I observe the system?

Can I reproduce it?

Can I prove that the optimization worked?
```

Those questions transformed my URL shortener.

I started with:

```text
Express + EJS + MongoDB
```

and ended with a full-stack system involving:

```text
Fastify
Redis
MongoDB
Queues
Workers
Clustering
Rate Limiting
Caching
Idempotency
Observability
Docker
Analytics
Next.js
Zustand
DNS-over-HTTPS
```

And somewhere along the way, I realized something much more important than any benchmark number.

**You don't necessarily become a better engineer by building increasingly complicated projects.**

**You become a better engineer by taking a simple project and asking increasingly difficult questions about it.**

That was the real purpose of this project.

**From CRUD to engineering.**
