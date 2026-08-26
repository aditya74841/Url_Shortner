import express from "express";
import apiUrlRoutes from "./api/url.routes.js";
import viewRoutes from "./view.routes.js";

const router = express.Router();

// Mount REST API routes
router.use("/api/v1/urls", apiUrlRoutes);

// Mount Web UI & redirection routes
router.use("/", viewRoutes);

export default router;
