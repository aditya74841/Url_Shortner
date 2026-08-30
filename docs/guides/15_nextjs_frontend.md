# Stage 15: Next.js Minimalist Frontend & State Management Architecture

## 🖥️ Overview & Tech Stack

Stage 15 implements a ultra-fast, minimalist frontend using **Next.js (App Router)**, **Zustand** for global state management, and **Axios** for API server communication.

- **Framework**: Next.js (App Router with Turbopack)
- **State Management**: Zustand (`client/store/useUrlStore.js`)
- **HTTP Client**: Axios (`client/lib/axios.js`)
- **Design System**: Minimalist Light Grey Theme (`#F8F9FA`, `#F1F3F5`, `#E9ECEF`, `#212529`)
- **Icons**: Lucide React

---

## 🛠️ Architecture & Setup

### 1. Environment Variable Configuration (`.env.local`)
The API base URL is stored in `client/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 2. Axios Client (`client/lib/axios.js`)
Configured to read `NEXT_PUBLIC_API_URL` with standard JSON content-type headers and a 10-second timeout.

### 3. Zustand Store (`client/store/useUrlStore.js`)
Centralized store controlling state for:
- `urls`: List of active short URLs.
- `recentUrl`: Instant short link result card.
- `analyticsData`: Selected URL analytics breakdown payload.
- `fetchUrls()`: Gets all active short links.
- `createShortUrl(fullUrl)`: Sends POST request to API and updates local state instantly.
- `fetchAnalytics(shortCode)`: Triggers modal displaying rich analytics.

---

## 🚀 Running the Frontend

```bash
# Start backend API (Port 5000)
npm run dev

# Start Next.js frontend (Port 3000) from root directory
npm run client
```

Or directly inside `client/`:
```bash
cd client
npm run dev
```
