const express = require("express");
const router = express.Router();

// Public routes
router.use("/auth", require("./public/auth.routes"));
router.use("/products", require("./public/product.routes"));
router.use("/stores", require("./public/store.routes"));
router.use("/search", require("./public/search.routes"));

// User routes
router.use("/users", require("./user/user-profile.routes"));
router.use("/cart", require("./auth/cart.routes"));
router.use("/orders", require("./auth/order.routes"));
// Wallet routes (accessible by all roles)
router.use("/wallet", require("./auth/wallet.routes"));
// Seller routes
router.use("/seller", require("./seller/seller.routes"));
// Admin route
router.use("/admin", require("./admin/admin.routes"));

module.exports = router;
