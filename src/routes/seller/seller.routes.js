// routes/seller/seller.routes.js
const express = require("express");
const router = express.Router();
const { protect: authMiddleware } = require("../../middlewares/auth.middleware");

// Import semua sub-routes
const productRoutes = require("./seller-product.routes");
const profileRoutes = require("./seller-profile.routes");
const orderRoutes = require("./seller-order.routes");
const analyticsRoutes = require("./seller-analytics.routes");
const cancelRequestRoutes = require("./seller-cancel-req.routes"); 

// Apply auth middleware untuk semua routes
router.use(authMiddleware);

// Mount sub-routes
router.use("/products", productRoutes);
router.use("/profile", profileRoutes);
router.use("/orders", orderRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/requests", cancelRequestRoutes);

module.exports = router;