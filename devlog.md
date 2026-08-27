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
