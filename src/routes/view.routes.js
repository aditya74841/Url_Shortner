import express from "express";
import * as viewController from "../controllers/view.controller.js";

const router = express.Router();

router.get("/", viewController.renderHome);
router.post("/shortUrls", viewController.createUrlForm);
router.get("/:shortUrl", viewController.redirectToFullUrl);

export default router;
