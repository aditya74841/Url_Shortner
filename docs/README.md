# URL Shortener Architecture & Implementation Documentation

Welcome to the documentation index for the High-Performance Scalable URL Shortener project.

---

## 📑 **Documentation Index**

### 1. **Core Development Story & Article**
* 📖 [**Engineering Journey Article (`docs/BUILDING_SENIOR_URL_SHORTENER.md`)**](BUILDING_SENIOR_URL_SHORTENER.md): Story of moving beyond basic CRUD to build a senior-level URL shortener scaling from 345 to 6,809 req/sec.
* 📝 [**Development Log (`docs/devlog.md`)**](devlog.md): Comprehensive stage-by-stage log & evolution story.

---

### 2. **Stage Architecture Guides (`docs/guides/`)**

1. ⚡ [**01. Redis Cache-Aside Strategy**](guides/01_redis_caching.md)  
   Sub-millisecond URL resolution via Redis string caching with TTL expiration.

2. 🛡️ [**02. Token Bucket Rate Limiting**](guides/02_rate_limiting.md)  
   Distributed rate limiting with Redis sliding-window token bucket algorithm.

3. 📥 [**03. Async Click Event Queue**](guides/03_event_queue.md)  
   Decoupling redirection from DB disk I/O using Redis List event buffers.

4. ⚙️ [**04. Batch Ingestion Worker**](guides/04_worker_batch.md)  
   Flushing thousands of click events into MongoDB in single bulkWrite() operations.

5. 🔒 [**05. Crash Recovery & Idempotency**](guides/05_idempotency.md)  
   RPOPLPUSH reliable processing queues and SET NX eventId deduplication locks.

6. 📊 [**06. Rich Analytics Pipeline**](guides/06_analytics_pipeline.md)  
   Browser, OS, Device, and Referrer aggregations using MongoDB Aggregation pipelines.

7. 🌐 [**07. Multi-Core Process Clustering**](guides/07_horizontal_scaling.md)  
   Scaling Node.js across multi-core CPUs via cluster mode and stateless API workers.

8. 🔍 [**08. Observability & Tracing**](guides/08_observability.md)  
   Non-blocking Pino JSON logging and end-to-end `X-Request-ID` correlation tracing.

9. 💥 [**09. High-Concurrency Chaos Testing**](guides/09_load_chaos_testing.md)  
   Stress testing throughput limits with Autocannon up to 6,800+ RPS.

10. 🚀 [**10. Fastify Migration Guide**](guides/10_fastify_migration.md)  
    Complete migration strategy from Express.js to Fastify for +41% RPS boost.

11. 🐳 [**14. Docker Containerization Guide**](guides/14_docker_containerization.md)  
    Multi-container orchestration setup with Docker Compose, Alpine Linux, and health checks.

12. ⚛️ [**15. Next.js Frontend Guide**](guides/15_nextjs_frontend.md)  
    Ultra-fast minimalist Light Grey frontend built with Next.js App Router, Zustand, and Axios.

---

### 3. **Future Roadmap & Ideas**
* 🗺️ [**Roadmap (`docs/roadmap.md`)**](roadmap.md): Planned features for Docker containerization and NGINX deployment.
