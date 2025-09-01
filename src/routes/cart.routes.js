const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);

// 🔒 Protected routes (khusus user login)
router.delete('/remove/:productId', cartController.removeFromCart); 
router.put('/update/:productId', cartController.updateCartItem);
router.get('/', cartController.getCart);         // Ambil cart
router.post('/add', cartController.addToCart);   // Tambah item

router.get('/count', cartController.getCartCount);
router.delete('/clear', cartController.clearCart);
router.post('/coupon', cartController.applyCoupon);
router.delete('/coupon', cartController.removeCoupon);

module.exports = router;
