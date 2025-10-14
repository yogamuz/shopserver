// routes/seller/seller-analytics.routes.js
const express = require("express");
const router = express.Router();
const SellerProductController = require("../../controllers/seller/seller-product.controller");
const { roleMiddleware } = require("../../middlewares/role.middleware");

// ANALYTICS ROUTES
router.get("/dashboard", roleMiddleware(['seller']), SellerProductController.getDashboardStats);//✅
router.get("/products", roleMiddleware(['seller']), SellerProductController.getProductStats);//✅

module.exports = router;