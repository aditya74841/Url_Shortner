import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes/index.js";
import globalErrorHandler from "./middlewares/error.middleware.js";
import AppError from "./utils/appError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Template Engine Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/", routes);

// 404 Handler for undefined routes
app.all("*", (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handling Middleware
app.use(globalErrorHandler);

export default app;
