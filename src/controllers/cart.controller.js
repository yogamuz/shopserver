// controllers/cartController.js - REFACTORED VERSION
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const CartService = require("../services/cart.service");
const CouponService = require("../services/coupon.service");

// Import logger
const logger = require("../utils/logger");
/**
 * GET /api/cart - Get user's cart
 */
exports.getCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const cartData = await CartService.getUserCart(userId);

    res.json({
      success: true,
      data: cartData
    });
  } catch (error) {
    logger.error("⚡ Error getting cart:", error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.GET_FAILED
    });
  }
};

/**
 * POST /api/cart/add - Add item to cart
 */
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const userId = req.user._id;

    const cart = await CartService.addItemToCart(userId, productId, quantity);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.ITEM_ADDED,
      data: cart,
    });
  } catch (error) {
    logger.error("⚡ Error adding to cart:", error);

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        data: error.data,
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.ADD_FAILED,
      error: error.message,
    });
  }
};

/**
 * PUT /api/cart/update/:productId - Update item quantity
 */
exports.updateCartItem = async (req, res) => {
  try {
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
  } catch (error) {
    logger.error("⚡ Error updating cart item:", error);
    logger.error("⚡ Error stack:", error.stack);

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        data: error.data,
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.UPDATE_FAILED,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/cart/remove/:productId - Remove item from cart
 */
exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    const cart = await CartService.removeItemFromCart(userId, productId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.ITEM_REMOVED,
      data: cart,
    });
  } catch (error) {
    logger.error("⚡ Error removing from cart:", error);

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.REMOVE_FAILED,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/cart/clear - Clear entire cart
 */
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await CartService.clearCart(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.CLEARED,
      data: cart,
    });
  } catch (error) {
    logger.error("⚡ Error clearing cart:", error);

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.CLEAR_FAILED,
      error: error.message,
    });
  }
};

/**
 * POST /api/cart/coupon - Apply coupon to cart
 */
exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user._id;

    const result = await CouponService.applyCoupon(userId, couponCode);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.COUPON_APPLIED,
      data: result,
    });
  } catch (error) {
    logger.error("⚡ Error applying coupon:", error);

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.COUPON_APPLY_FAILED,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/cart/coupon - Remove coupon from cart
 */
exports.removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await CouponService.removeCoupon(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CART.COUPON_REMOVED,
      data: result,
    });
  } catch (error) {
    logger.error("⚡ Error removing coupon:", error);

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.COUPON_REMOVE_FAILED,
      error: error.message,
    });
  }
};

/**
 * GET /api/cart/count - Get cart items count
 */
exports.getCartCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await CartService.getCartCount(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("⚡ Error fetching cart count:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.CART.COUNT_GET_FAILED,
      error: error.message,
    });
  }
};
