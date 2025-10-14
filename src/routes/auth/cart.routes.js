// routes/cart.routes.js - FIXED route paths
const express = require('express');
const router = express.Router();
const CartController = require('../../controllers/cart.controller');
const { protect } = require('../../middlewares/auth.middleware');
const preventSelfPurchase = require('../../middlewares/prevent-self-purchase');

router.use(protect);

// IMPORTANT: Specific routes MUST come before parameterized routes
router.route('/coupon') 
  .post(CartController.applyCoupon)//✅
  .delete(CartController.removeCoupon)//✅

router.get('/count', CartController.getCartCount);//✅

router.route('/')
  .get(CartController.getCart)//✅
  .post(preventSelfPurchase, CartController.addToCart)//✅
  .delete(CartController.clearCart)//✅

router.route('/:productId')
  .put(preventSelfPurchase, CartController.updateCartItem)//✅
  .delete(CartController.removeFromCart)//✅
  

module.exports = router;