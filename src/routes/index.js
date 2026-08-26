import express from "express";
import apiUrlRoutes from "./api/url.routes.js";
import { redirectToFullUrl } from "../controllers/url.controller.js";

const router = express.Router();

// Mount REST API routes
router.use("/api/v1/urls", apiUrlRoutes);

// Short URL HTTP Redirection endpoint
router.get("/:shortUrl", redirectToFullUrl);

export default router;
