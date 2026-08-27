import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * High-Performance Structured Logger (Pino)
 * Outputs non-blocking structured JSON log events in production,
 * and readable pretty logs in development.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    pid: process.pid,
    env: process.env.NODE_ENV || "development",
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,env",
        },
      },
});

/**
 * Creates a scoped child logger with injected correlation context (e.g. requestId)
 * @param {Object} bindings Contextual metadata (e.g. { requestId: "..." })
 */
export const createScopedLogger = (bindings = {}) => {
  return logger.child(bindings);
};
