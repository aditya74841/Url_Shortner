import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Retrieve the existing anonymous client ID or generate and persist a new UUIDv4.
 * Safe for Next.js SSR hydration.
 */
export function getClientId() {
  if (typeof window === "undefined") return null;
  try {
    let clientId = localStorage.getItem("anon_client_id");
    if (!clientId) {
      clientId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem("anon_client_id", clientId);
    }
    return clientId;
  } catch (err) {
    console.warn("Unable to access localStorage for client ID:", err);
    return null;
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Automatically inject anonymous client ID into every outgoing API request
api.interceptors.request.use(
  (config) => {
    const clientId = getClientId();
    if (clientId) {
      config.headers["X-Client-ID"] = clientId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
