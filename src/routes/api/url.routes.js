import express from "express";
import * as urlController from "../../controllers/url.controller.js";

const router = express.Router();

router.route("/")
  .post(urlController.createUrl)
  .get(urlController.getAllUrls);

// Stats route
router.get("/:shortUrl/stats", urlController.getUrlStats);

// Click tracking API routes
router.post("/:shortUrl/click", urlController.registerClickApi);
router.post("/click/:shortUrl", urlController.registerClickApi);

export default router;
