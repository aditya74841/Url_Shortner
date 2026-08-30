# High-Performance Scalable URL Redirection Engine

A production-grade, event-driven URL shortener and analytics backend built with **Fastify**, **Redis**, and **MongoDB**. Designed for extreme throughput, low latency redirection (< 15ms), distributed correlation tracing, and crash-resilient batch analytics processing.

---

## ⚡ **Performance Metrics**

Benchmarked under high-concurrency chaos stress tests (`autocannon` 50+ concurrent virtual connections):

| Metric | Express.js Baseline | Fastify + Local Redis Engine | Performance Gain |
| :--- | :--- | :--- | :--- |
| **Throughput (RPS)** | ~345 req/sec | **6,809 req/sec** | **19.7x Throughput Boost** |
| **p99 Latency** | 228 ms | **13 ms** | **94.3% Lower Latency** |
| **Server Error Rate (5xx)** | 0 (0%) | **0 (0%)** | 100% Server Reliability |
| **Click Data Accounting** | 100% | **100% (Zero Lost Events)** | Idempotent At-Least-Once Delivery |

---

## 🏗️ **Architecture Overview**

```text
                       [ Incoming User HTTP Request ]
                                     │
                                     ▼
                     [ Fastify High-Speed API Node ]
                  (Token Bucket Rate Limit & Redis Cache)
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
   [ Instant HTTP 302 Redirect ]             [ Non-Blocking Event Producer ]
         (Latency < 13ms)                    (Push to Redis List Event Queue)
                                                             │
                                                             ▼
                                                [ Analytics Worker Consumer ]
                                            (Pipelined Deduplication via SET NX)
                                                             │
                                                             ▼
                                                [ Dual MongoDB BulkWrite ]
                                            (ShortUrl counts & UrlAnalytics logs)
```

---

## 📁 **Project Directory Structure**

```text
URL_Shortner-main/
├── docs/                        # Complete Architectural & Implementation Guides
│   ├── devlog.md                # Stage-by-stage development log & story
│   ├── roadmap.md               # Future features & roadmap ideas
│   └── guides/                  # Stage-by-stage deep-dive documentation
│       ├── 01_redis_caching.md       # Cache-Aside pattern implementation
│       ├── 02_rate_limiting.md       # Redis Token Bucket algorithm
│       ├── 03_event_queue.md         # Async message producer-consumer model
│       ├── 04_worker_batch.md        # Bulk Ingestion worker architecture
│       ├── 05_idempotency.md         # RPOPLPUSH & SET NX deduplication
│       ├── 06_analytics_pipeline.md  # Rich click analytics & aggregations
│       ├── 07_horizontal_scaling.md  # Multi-node process clustering
│       ├── 08_observability.md        # Pino structured JSON logging & correlation IDs
│       ├── 09_load_chaos_testing.md  # Autocannon chaos load benchmarks
│       └── 10_fastify_migration.md   # Express -> Fastify refactoring guide
├── scripts/                     # Automated benchmark & test suites
│   ├── testAnalytics.js         # Rich analytics pipeline verification
│   ├── testChaosLoad.js         # Single-core high-concurrency load test
│   ├── testClusterChaos.js      # 4-core multi-process cluster stress test
│   ├── testCluster.js           # Multi-node API server scaling test
│   ├── testObservability.js     # Request ID correlation tracing test
│   └── ...                      # Additional Stage verification scripts
├── src/                         # Application Source Code
│   ├── config/                  # DB and Redis connections
│   ├── controllers/             # Fastify request handlers
│   ├── middlewares/             # PreHandler hooks (Rate Limiters)
│   ├── models/                  # Mongoose Schemas (ShortUrl, UrlAnalytics)
│   ├── routes/                  # Fastify plugin route definitions
│   ├── services/                # Business logic & Redis Queue services
│   ├── utils/                   # Pino Logger, Base62 Generator, UserAgent parser
│   └── workers/                 # Analytics background worker engine
├── app.js                       # Fastify application factory
├── server.js                    # Server lifecycle entry point
├── package.json                 # Node.js dependencies & test scripts
└── .env.example                 # Environment variables configuration template
```

---

## 🚀 **Quick Start Guide**

### **1. Prerequisites**
* Node.js v18+
* MongoDB running locally or URI connection string
* Local Redis Server (`redis-server`) or Upstash Redis URL

### **2. Installation & Setup**
```bash
# Clone the repository
git clone <repository-url>
cd Url_Shortner-main

# Install dependencies
npm install

# Configure Environment Variables
cp .env.example .env
```

### **3. Running the Application**
```bash
# Development Mode
npm run dev

# Start Single Server
npm run start

# Multi-Core Process Cluster Mode (4 Workers)
WORKERS_COUNT=4 node src/cluster.js
```

---

## 🧪 **Automated Benchmark & Verification Suite**

| Command | Purpose |
| :--- | :--- |
| `npm run test-chaos` | Single-Core Autocannon High-Concurrency Chaos Benchmark (6,800+ RPS) |
| `npm run test-cluster-chaos` | 4-Core Multi-Process Cluster Stress Benchmark |
| `npm run test-analytics` | Rich Analytics Pipeline Ingestion & Aggregation Test |
| `npm run test-observability` | Request ID (`X-Request-ID`) End-to-End Tracing Verification |
| `npm run test-idempotency` | Worker Crash Simulation & Deduplication Verification |
| `npm run test-cluster` | Multi-Node API Server Stateless Synchronization Test |
| `npm run test-rate-limit` | Redis Token Bucket Rate Limiting Test |

---

## 📚 **Documentation Index**

All architectural guides are organized inside the [`docs/`](docs/) directory:

* 📖 [**Engineering Journey Article (`docs/BUILDING_SENIOR_URL_SHORTENER.md`)**](docs/BUILDING_SENIOR_URL_SHORTENER.md)
* 📝 [**Development Log (`docs/devlog.md`)**](docs/devlog.md)
* ⚡ [**Redis Cache-Aside Pattern (`docs/guides/01_redis_caching.md`)**](docs/guides/01_redis_caching.md)
* 🛡️ [**Token Bucket Rate Limiting (`docs/guides/02_rate_limiting.md`)**](docs/guides/02_rate_limiting.md)
* 📥 [**Async Click Event Queue (`docs/guides/03_event_queue.md`)**](docs/guides/03_event_queue.md)
* ⚙️ [**Batch Ingestion Analytics Worker (`docs/guides/04_worker_batch.md`)**](docs/guides/04_worker_batch.md)
* 🔒 [**Crash Recovery & Idempotency (`docs/guides/05_idempotency.md`)**](docs/guides/05_idempotency.md)
* 📊 [**Rich Analytics Pipeline (`docs/guides/06_analytics_pipeline.md`)**](docs/guides/06_analytics_pipeline.md)
* 🌐 [**Process Clustering & Scaling (`docs/guides/07_horizontal_scaling.md`)**](docs/guides/07_horizontal_scaling.md)
* 🔍 [**Observability & Tracing (`docs/guides/08_observability.md`)**](docs/guides/08_observability.md)
* 💥 [**High-Concurrency Chaos Testing (`docs/guides/09_load_chaos_testing.md`)**](docs/guides/09_load_chaos_testing.md)
* 🚀 [**Fastify Migration Guide (`docs/guides/10_fastify_migration.md`)**](docs/guides/10_fastify_migration.md)
* 🐳 [**Docker Containerization Guide (`docs/guides/14_docker_containerization.md`)**](docs/guides/14_docker_containerization.md)
* ⚛️ [**Next.js Minimalist Frontend (`docs/guides/15_nextjs_frontend.md`)**](docs/guides/15_nextjs_frontend.md)
