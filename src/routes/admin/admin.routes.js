const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../middlewares/auth.middleware");

// Import route modules
const adminUserRoutes = require("./admin-user.routes");
const adminWalletRoutes = require("./admin-wallet.routes");
const adminCacheRoutes= require('./cache.routes')
// Protect all admin routes
router.use(protect);
router.use(restrictTo("admin"));

// Mount separate route modules
router.use("/users", adminUserRoutes);
router.use("/wallets", adminWalletRoutes);
router.use("/cache", adminCacheRoutes)

module.exports = router;