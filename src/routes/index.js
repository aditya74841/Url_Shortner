import express from "express";
import apiUrlRoutes from "./api/url.routes.js";
import { redirectToFullUrl } from "../controllers/url.controller.js";
import { readRedirectRateLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = express.Router();

// Mount REST API routes
router.use("/api/v1/urls", apiUrlRoutes);

// Short URL HTTP Redirection endpoint with Rate Limiting
router.get("/:shortUrl", readRedirectRateLimiter, redirectToFullUrl);

export default router;
