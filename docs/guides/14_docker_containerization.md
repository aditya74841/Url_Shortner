# Stage 14: Containerization with Docker & Docker-Compose

## 🐳 Architecture & Container Topology

Stage 14 packages the URL Shortener into isolated, production-ready OCI container images and orchestrates **Fastify API**, **Local Redis**, and **MongoDB** using `docker-compose`.

```text
                                  [ Port 5000 ]
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │       url_shortner_app        │
                        │    (Node 20 Alpine Runner)    │
                        └───────────────┬───────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
  ┌─────────────────────────────┐               ┌─────────────────────────────┐
  │     url_shortner_redis      │               │    url_shortner_mongodb     │
  │    (Redis 7 Alpine RAM)     │               │     (Mongo 6 Alpine DB)     │
  └─────────────────────────────┘               └─────────────────────────────┘
```

---

## 🛠️ Files Created

### 1. `Dockerfile` (Multi-Stage Production Build)
- Uses **Multi-stage builds** to isolate build tools from final runtime image (`node:20-alpine`).
- Runs as a **non-root user** (`USER node`) for Linux security isolation.
- Implements `HEALTHCHECK` command querying `http://localhost:5000/health`.

### 2. `.dockerignore`
- Excludes `node_modules`, `.git`, `.env`, test scripts, and documentation files to keep the build context light (~1MB) and build speed fast.

### 3. `docker-compose.yml`
- Orchestrates 3 services:
  - `mongodb`: MongoDB 6 database with persistent volume (`mongo-data`).
  - `redis`: Redis 7 cache/queue with persistent volume (`redis-data`).
  - `app`: Fastify Node.js API service dependent on `mongodb` and `redis` health checks (`service_healthy`).

---

## 🚀 Running with Docker Compose

### **Start All Containers in Background**:
```bash
docker compose up -d --build
```

### **Check Health & Status**:
```bash
docker compose ps
```

### **View Container Logs**:
```bash
docker compose logs -f app
```

### **Stop & Clean Containers**:
```bash
docker compose down
```
