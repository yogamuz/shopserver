// routes/seller/seller-order.routes.js
const express = require("express");
const router = express.Router();
const SellerOrderController = require("../../controllers/seller/seller-order.controller");
const { roleMiddleware } = require("../../middlewares/role.middleware");

// ORDER ROUTES
router.get("/", roleMiddleware(['seller']), SellerOrderController.getSellerOrders); 
router.get('/reviews', roleMiddleware(['seller']),SellerOrderController.getSellerReviews);
router.get('/reviews/stats',roleMiddleware(['seller']) ,SellerOrderController.getSellerReviewStats);
router.patch("/:orderId/ship", roleMiddleware(['seller']), SellerOrderController.shipOrder); 
router.get("/earnings", roleMiddleware(['seller']), SellerOrderController.getSellerEarnings); 
// ini adalah file yang terpisah endpoint aslinya /api/seller/orders

// Optional: Add route for order details if needed in the future    
// router.get("/:orderId", roleMiddleware(['seller']), SellerOrderController.getOrderDetails);

module.exports = router;