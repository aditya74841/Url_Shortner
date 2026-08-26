import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...", err.name, err.message, err.stack);
  process.exit(1);
});

// Connect Database
connectDB();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`[Server] Service running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[Server Error] Port ${PORT} is already in use. Please kill the existing process or use a different PORT.`);
  } else {
    console.error("[Server Error]", err);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...", err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// SIGTERM graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully...");
  server.close(() => {
    console.log("💥 Process terminated!");
  });
});
