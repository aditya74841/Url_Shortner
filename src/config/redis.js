import Redis from "ioredis";
import RedisMock from "ioredis-mock";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient = null;
let isRedisConnected = false;
let isUsingMock = false;

const createClient = () => {
  if (redisClient) return redisClient;

  // Primary real Redis client
  const realClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    retryStrategy(times) {
      if (times > 2) return null; // Stop retrying real Redis after 2 attempts
      return 200;
    },
    lazyConnect: true,
  });

  realClient.on("connect", () => {
    isRedisConnected = true;
    isUsingMock = false;
    console.log(`[Redis] Connected successfully to ${redisUrl}`);
  });

  realClient.on("error", (err) => {
    if (!isUsingMock && !isRedisConnected) {
      console.warn(`[Redis Warning] Real Redis unavailable (${err.message}). Switching to In-Memory Redis Engine.`);
      switchToMock();
    }
  });

  redisClient = realClient;
  return redisClient;
};

const switchToMock = () => {
  if (isUsingMock) return;
  isUsingMock = true;
  isRedisConnected = true;
  redisClient = new RedisMock();
  console.log(`[Redis] In-Memory Redis Engine initialized and active.`);
};

export const initRedis = async () => {
  const client = createClient();
  try {
    await client.connect();
  } catch (error) {
    switchToMock();
  }
};

export const getIsRedisConnected = () => isRedisConnected;

// Proxy object so callers transparently use whatever client is active
const redisProxy = new Proxy({}, {
  get(target, prop) {
    if (prop === "connect") return () => initRedis();
    if (prop === "disconnect" || prop === "quit") {
      return () => {
        if (redisClient && typeof redisClient[prop] === "function") {
          return redisClient[prop]();
        }
      };
    }
    if (!redisClient) createClient();
    const value = redisClient[prop];
    return typeof value === "function" ? value.bind(redisClient) : value;
  }
});

export default redisProxy;
