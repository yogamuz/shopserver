const express = require('express');
const OrderController = require('../controllers/order.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// Order routes
router.get('/', authMiddleware.protect, OrderController.getUserOrders);
router.get('/:orderId', authMiddleware.protect, OrderController.getOrderById);
router.patch('/:orderId/cancel', authMiddleware.protect, OrderController.cancelOrder);
router.post('/create-order', authMiddleware.protect, OrderController.createOrder);

// Payment webhook (no auth required)
router.post('/payment/:orderNumber/update', OrderController.updatePaymentStatus);

module.exports = router;
