import express from "express";
import * as urlController from "../../controllers/url.controller.js";
import { strictWriteRateLimiter } from "../../middlewares/rateLimiter.middleware.js";

const router = express.Router();

// Apply strict rate limiting to URL creation (POST /api/v1/urls)
router.route("/")
  .post(strictWriteRateLimiter, urlController.createUrl)
  .get(urlController.getAllUrls);

// Stats route
router.get("/:shortUrl/stats", urlController.getUrlStats);

// Click tracking API routes
router.post("/:shortUrl/click", urlController.registerClickApi);
router.post("/click/:shortUrl", urlController.registerClickApi);

export default router;
