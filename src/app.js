import express from "express";
import routes from "./routes/index.js";
import globalErrorHandler from "./middlewares/error.middleware.js";
import AppError from "./utils/appError.js";

const app = express();

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Mount Routes
app.use("/", routes);

// 404 Handler for undefined routes
app.all("*", (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handling Middleware
app.use(globalErrorHandler);

export default app;
