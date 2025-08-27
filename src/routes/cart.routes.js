// routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth.middleware');
// Semua cart routes memerlukan authentication
router.use(protect);

// Debug middleware (hapus setelah testing selesai)


// GET /api/cart - Get user's cart (supports both authenticated and guest)
router.get('/', cartController.getCart);

// GET /api/cart/count - Get cart items count
router.get('/count', cartController.getCartCount);

// POST /api/cart/add - Add item to cart
router.post('/add', cartController.addToCart);

// PUT /api/cart/update/:productId - Update item quantity
router.put('/update/:productId', cartController.updateCartItem);

// DELETE /api/cart/remove/:productId - Remove item from cart
router.delete('/remove/:productId', cartController.removeFromCart);

// DELETE /api/cart/clear - Clear entire cart
router.delete('/clear', cartController.clearCart);

// POST /api/cart/coupon - Apply coupon to cart
router.post('/coupon', cartController.applyCoupon);

// DELETE /api/cart/coupon - Remove coupon from cart
router.delete('/coupon', cartController.removeCoupon);

module.exports = router;