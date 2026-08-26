import express from "express";
import * as urlController from "../../controllers/url.controller.js";

const router = express.Router();

router.route("/")
  .post(urlController.createUrl)
  .get(urlController.getAllUrls);

router.get("/:shortUrl", urlController.getUrlStats);
router.post("/click/:shortUrl", urlController.registerClickApi);

export default router;
