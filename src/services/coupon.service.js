// services/couponService.js
const Cart = require('../models/cart.model');
const Coupon = require('../models/coupon.model');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');
const { populateCart } = require('../utils/cart.util');
const logger = require('../utils/logger');


class CouponService {
  /**
   * Apply coupon to cart
   */
  static async applyCoupon(userId, couponCode) {
    if (!couponCode) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.COUPON_CODE_REQUIRED
      };
    }

    let cart = await Cart.findByUser(userId);
    if (!cart || cart.items.length === 0) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.EMPTY
      };
    }

    // Populate cart items to get categories
    await cart.populate({
      path: 'items.product',
      select: 'category',
      populate: {
        path: 'category',
        select: 'name'
      }
    });

    // Populate with full details for response
    await populateCart(cart);

    // Find valid coupon
    const coupon = await Coupon.findValidCoupon(couponCode);
    if (!coupon) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.INVALID_COUPON
      };
    }

    // Check if cart already has a coupon
    if (cart.appliedCoupon) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.COUPON_EXISTS
      };
    }

    // Calculate prices and validate coupon
    const priceCalculation = this.calculateCouponPrices(cart, coupon);
    
    // Validate minimum amount
    if (priceCalculation.applicablePrice < coupon.minAmount) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: `${MESSAGES.CART.MINIMUM_AMOUNT_NOT_MET} ${new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 0
        }).format(coupon.minAmount)} ${coupon.category ? `for ${coupon.category} products` : ''} for this coupon`
      };
    }

    // Check category match for category-specific coupons
    if (coupon.category && priceCalculation.applicablePrice === 0) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: `${MESSAGES.CART.COUPON_CATEGORY_MISMATCH} ${coupon.category} products`
      };
    }

    // Calculate discount amount
    const discountAmount = Math.min(
      (priceCalculation.applicablePrice * coupon.discount) / 100, 
      coupon.maxDiscount
    );

    // Apply coupon to cart
    cart.appliedCoupon = {
      couponId: coupon._id,
      code: coupon.code,
      discountAmount: discountAmount,
      appliedAt: new Date()
    };

    await cart.save();

    // Increment coupon usage count
    await coupon.use();

    logger.info(`✅ Coupon applied: ${couponCode} (discount: ${discountAmount})`);

    return {
      cart: cart.toObject(),
      couponDetails: {
        code: coupon.code,
        discount: coupon.discount,
        category: coupon.category,
        description: coupon.description
      },
      totalPrice: priceCalculation.totalPrice,
      discountAmount: discountAmount,
      finalPrice: priceCalculation.totalPrice - discountAmount
    };
  }

  /**
   * Remove coupon from cart
   */
  static async removeCoupon(userId) {
    let cart = await Cart.findByUser(userId);
    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND
      };
    }

    if (!cart.appliedCoupon) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.NO_COUPON_TO_REMOVE
      };
    }

    // Store coupon info before removing
    const removedCouponId = cart.appliedCoupon.couponId;

    // Remove coupon from cart
    cart.appliedCoupon = undefined;
    await cart.save();

    // Decrement coupon usage count
    await this.decrementCouponUsage(removedCouponId);

    // Populate for response
    await populateCart(cart);

    logger.info(`✅ Coupon removed from cart`);

    return {
      cart: cart.toObject(),
      totalPrice: cart.calculateTotal(),
      finalPrice: cart.calculateFinalPrice()
    };
  }

  /**
   * Get available coupons for user's cart
   */
  static async getAvailableCoupons(userId) {
    // Get user's cart
    let cart = await Cart.findByUser(userId);
    if (!cart) {
      cart = await Cart.findOne({ user: userId, isActive: true });
    }

    if (!cart || cart.items.length === 0) {
      throw {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.EMPTY
      };
    }

    // Get categories in cart
    const cartCategories = cart.items
      .map(item => item.product?.category?.name)
      .filter(category => category)
      .map(category => category.toLowerCase());

    const uniqueCategories = [...new Set(cartCategories)];

    // Find applicable coupons
    const now = new Date();
    const availableCoupons = await Coupon.find({
      isActive: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gte: now } }
      ],
      $or: [
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
      ],
      $or: [
        { category: { $exists: false } },
        { category: null },
        { category: { $in: uniqueCategories } }
      ]
    }).select('-usedCount');

    return {
      coupons: availableCoupons,
      cartCategories: uniqueCategories
    };
  }

  /**
   * Calculate prices for coupon application
   */
  static calculateCouponPrices(cart, coupon) {
    let totalPrice = 0;
    let applicablePrice = 0;

    for (const item of cart.items) {
      const itemTotal = item.priceAtAddition * item.quantity;
      totalPrice += itemTotal;

      // If coupon has category restriction
      if (coupon.category) {
        if (item.product && item.product.category && 
            item.product.category.name.toLowerCase() === coupon.category.toLowerCase()) {
          applicablePrice += itemTotal;
        }
      } else {
        // General coupon applies to all items
        applicablePrice += itemTotal;
      }
    }

    return {
      totalPrice,
      applicablePrice: coupon.category ? applicablePrice : totalPrice
    };
  }

  /**
   * Decrement coupon usage count
   */
  static async decrementCouponUsage(couponId) {
    try {
      const coupon = await Coupon.findById(couponId);
      if (coupon && coupon.usedCount > 0) {
        coupon.usedCount -= 1;
        await coupon.save();
      }
    } catch (couponError) {
      logger.warn('⚠️ Could not decrement coupon usage count:', couponError.message);
    }
  }
}

module.exports = CouponService;