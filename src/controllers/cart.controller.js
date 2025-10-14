// controllers/cartController.js - REFACTORED TO CLASS-BASED VERSION
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const CartService = require("../services/cart.service");
const CouponService = require("../services/coupon.service");
const asyncHandler = require('../middlewares/asyncHandler');

// Import logger
const logger = require("../utils/logger");

class CartController {
  /**
   * GET /api/cart - Get user's cart
   */
  static getCart = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const cartData = await CartService.getUserCart(userId);

    res.json({
      success: true,
      data: cartData
    });
  });

  /**
   * POST /api/cart/add - Add item to cart
   */
  static addToCart = asyncHandler(async (req, res) => {
    const { productId, quantity = 1 } = req.body;
    const userId = req.user._id;

    const cart = await CartService.addItemToCart(userId, productId, quantity);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.ITEM_ADDED,
      data: cart,
    });
  });

  /**
   * PUT /api/cart/:productId - Update item quantity
   */
  static updateCartItem = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.user._id;

    const result = await CartService.updateCartItem(
      userId,
      productId,
      quantity
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.isRemoved
        ? MESSAGES.CART.ITEM_REMOVED
        : MESSAGES.CART.ITEM_UPDATED,
      data: result.cart,
    });
  });

  /**
   * DELETE /api/cart/productId - Remove item from cart
   */
  static removeFromCart = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user._id;

    const cart = await CartService.removeItemFromCart(userId, productId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.ITEM_REMOVED,
      data: cart,
    });
  });

  /**
   * DELETE /api/cart/clear - Clear entire cart
   */
  static clearCart = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const cart = await CartService.clearCart(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.CLEARED,
      data: cart,
    });
  });

  /**
   * POST /api/cart/coupon - Apply coupon to cart
   */
  static applyCoupon = asyncHandler(async (req, res) => {
    const { couponCode } = req.body;
    const userId = req.user._id;

    const result = await CouponService.applyCoupon(userId, couponCode);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.COUPON_APPLIED,
      data: result,
    });
  });

  /**
   * DELETE /api/cart/coupon - Remove coupon from cart
   */
static removeCoupon = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await CouponService.removeCoupon(userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: MESSAGES.CART.COUPON_REMOVED,
    data: result, // result is already formatted cart response
  });
});

  /**
   * GET /api/cart/count - Get cart items count
   */
  static getCartCount = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const result = await CartService.getCartCount(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  });
}

module.exports = CartController;