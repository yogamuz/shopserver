const express = require('express');
const  CheckoutController  = require('../controllers/checkout.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// Checkout routes
router.get('/info', authMiddleware.protect, CheckoutController.getCheckoutInfo);
router.post('/preview', authMiddleware.protect, CheckoutController.previewOrder);

module.exports = router;
