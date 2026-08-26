import AppError from "../utils/appError.js";

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV !== "test") {
    console.error(`[Error Handler] ${err.statusCode} - ${err.message}`, err.stack);
  }

  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    err = new AppError(`Duplicate value for '${field}'. Please use another value!`, 400);
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((el) => el.message);
    err = new AppError(`Invalid input data. ${errors.join(". ")}`, 400);
  }

  // API response vs Web View response
  const isApiRequest = req.originalUrl.startsWith("/api") || (req.accepts("json") && !req.accepts("html"));

  if (isApiRequest) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }

  // Web View fallback response
  return res.status(err.statusCode).send(
    `<script>alert("${err.message.replace(/"/g, '\\"')}"); window.location.href = "/";</script>`
  );
};

export default globalErrorHandler;
