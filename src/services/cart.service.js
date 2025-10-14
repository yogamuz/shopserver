// services/cartService.js
const Cart = require("../models/cart.model");
const Product = require("../models/products.model");
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const {
  populateCart,
  validateQuantity,
  validateStock,
  validateStockForUpdate,
  formatCartResponse,
} = require("../utils/cart.util");
const logger = require("../utils/logger");

// services/cartService.js - Updated methods with coupon revalidation
class CartService {
  /**
   * Get user's cart with populated data
   */
  static async getUserCart(userId) {
    let cart = await Cart.findOne({ user: userId, isActive: true }).populate({
      path: "items.product",
      select: "title description price stock image category sellerId slug",
      populate: [
        {
          path: "category",
          select: "name description slug",
        },
        {
          path: "sellerId",
          select: "_id userId storeName storeSlug logo",
          model: "SellerProfile",
        },
      ],
    });

    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND,
      };
    }

    // Update cart items with current prices before returning
    let hasUpdatedPrices = false;

    cart.items = cart.items.map(item => {
      if (item.product && item.product.price !== item.priceAtAddition) {
        logger.info(`Price updated for ${item.product.title}: ${item.priceAtAddition} -> ${item.product.price}`);
        item.priceAtAddition = item.product.price;
        hasUpdatedPrices = true;
      }
      return item;
    });

    // Save cart if prices were updated
    if (hasUpdatedPrices) {
      await cart.save();
      logger.info("Cart prices synchronized with current product prices");
    }

    // Revalidate coupon if exists after price updates
    if (cart.appliedCoupon) {
      await this.revalidateAppliedCoupon(cart);
    }

    return formatCartResponse(cart);
  }

  /**
   * Add item to cart
   */
  static async addItemToCart(userId, productId, quantity = 1) {
    // Validate quantity
    const quantityValidation = validateQuantity(quantity);
    if (!quantityValidation.isValid) {
      throw quantityValidation.error;
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.PRODUCT.NOT_FOUND,
      };
    }

    // Find or create cart
    let cart = await Cart.findByUser(userId);
    if (!cart) {
      cart = new Cart({ user: userId });
    }

    // Check if product already exists in cart
    const existingItem = cart.items.find(item => item.product.toString() === productId.toString());

    const currentQuantityInCart = existingItem ? existingItem.quantity : 0;

    // Validate stock
    const stockValidation = validateStock(product, quantity, currentQuantityInCart);
    if (!stockValidation.isValid) {
      throw stockValidation.error;
    }

    // Add item to cart
    await cart.addProduct(productId, quantity, product.price);

    // Populate cart
    await populateCart(cart);

    // Revalidate coupon if exists
    if (cart.appliedCoupon) {
      await this.revalidateAppliedCoupon(cart);
    }

    logger.info(`Item added to cart: ${product.title} (qty: ${quantity})`);

    return formatCartResponse(cart);
  }

  /**
   * Update item quantity in cart
   */

  static async updateCartItem(userId, productId, quantity) {
    // Validate quantity
    const quantityValidation = validateQuantity(quantity);
    if (!quantityValidation.isValid) {
      throw quantityValidation.error;
    }

    // Get product for stock validation
    const product = await Product.findById(productId);
    if (!product) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.PRODUCT.NOT_FOUND,
      };
    }

    // Get cart
    let cart = await Cart.findOne({ user: userId, isActive: true });
    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND,
      };
    }

    // Find item in cart
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId.toString());

    if (itemIndex === -1) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.ITEM_NOT_FOUND,
      };
    }

    // Validate stock for update
    const stockValidation = validateStockForUpdate(product, quantity);
    if (!stockValidation.isValid) {
      throw stockValidation.error;
    }

    // Update or remove item
    if (quantity === 0) {
      cart.items.splice(itemIndex, 1);
      logger.info("Item removed from cart");
    } else {
      cart.items[itemIndex].quantity = quantity;
      // Update price at addition with current price
      cart.items[itemIndex].priceAtAddition = product.price;
      logger.info("Item quantity updated");
    }

    // Save cart first
    await cart.save();

    // Re-fetch and populate cart properly with explicit query options
    cart = await Cart.findOne({ user: userId, isActive: true }).populate({
      path: "items.product",
      select: "title description price stock image category sellerId slug",
      options: {
        skipSoftDeleteFilter: true,
        includeDeleted: false,
      },
      match: { deletedAt: { $in: [null, undefined] } }, // Explicit match condition
      populate: [
        {
          path: "category",
          select: "name description slug",
        },
        {
          path: "sellerId",
          select: "_id userId storeName storeSlug logo", //
          model: "SellerProfile",
        },
      ],
    });

    // Revalidate coupon if exists
    if (cart.appliedCoupon && cart.items.length > 0) {
      await this.revalidateAppliedCoupon(cart);
    } else if (cart.appliedCoupon && cart.items.length === 0) {
      // Remove coupon if cart is empty
      cart.appliedCoupon = undefined;
      await cart.save();
    }

    logger.info(`Cart item updated: ${productId} (qty: ${quantity})`);

    return {
      cart: formatCartResponse(cart),
      isRemoved: quantity === 0,
    };
  }
  /**
   * Remove item from cart
   */
  static async removeItemFromCart(userId, productId) {
    const cart = await Cart.findByUser(userId);
    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND,
      };
    }

    // Remove item
    await cart.removeProduct(productId);

    // Populate for response
    await populateCart(cart);

    // Revalidate coupon if exists
    if (cart.appliedCoupon && cart.items.length > 0) {
      await this.revalidateAppliedCoupon(cart);
    } else if (cart.appliedCoupon && cart.items.length === 0) {
      // Remove coupon if cart is empty
      cart.appliedCoupon = undefined;
      await cart.save();
    }

    logger.info(`Item removed from cart: ${productId}`);

    return formatCartResponse(cart);
  }

  /**
   * Revalidate applied coupon when cart changes
   */
  static async revalidateAppliedCoupon(cart) {
    try {
      const Coupon = require("../models/coupon.model");
      const coupon = await Coupon.findById(cart.appliedCoupon.couponId);

      if (!coupon || !coupon.isValid) {
        // Remove invalid coupon
        cart.appliedCoupon = undefined;
        await cart.save();
        logger.info("Invalid coupon removed during revalidation");
        return;
      }

      // Recalculate discount for all applicable items
      const priceCalculation = this.calculateCouponPrices(cart, coupon);

      // Check if minimum amount is still met
      if (priceCalculation.applicablePrice < coupon.minAmount) {
        cart.appliedCoupon = undefined;
        await cart.save();
        logger.info("Coupon removed: minimum amount no longer met");
        return;
      }

      // Recalculate discount amount
      const newDiscountAmount = Math.min(
        (priceCalculation.applicablePrice * coupon.discount) / 100,
        coupon.maxDiscount
      );

      // Update discount amount if changed
      if (cart.appliedCoupon.discountAmount !== newDiscountAmount) {
        cart.appliedCoupon.discountAmount = newDiscountAmount;
        await cart.save();
        logger.info(`Coupon discount updated: ${newDiscountAmount}`);
      }
    } catch (error) {
      logger.error("Error revalidating coupon:", error);
      // Remove coupon on error to prevent issues
      cart.appliedCoupon = undefined;
      await cart.save();
    }
  }

  /**
   * Calculate coupon prices
   */
  static calculateCouponPrices(cart, coupon) {
    let totalPrice = 0;
    let applicablePrice = 0;

    for (const item of cart.items) {
      const itemTotal = (item.product?.price || item.priceAtAddition) * item.quantity;
      totalPrice += itemTotal;

      // If coupon has category restriction
      if (coupon.category) {
        if (
          item.product &&
          item.product.category &&
          item.product.category.name.toLowerCase() === coupon.category.toLowerCase()
        ) {
          applicablePrice += itemTotal;
        }
      } else {
        // General coupon applies to all items
        applicablePrice += itemTotal;
      }
    }

    return {
      totalPrice,
      applicablePrice: coupon.category ? applicablePrice : totalPrice,
    };
  }

  /**
   * Clear entire cart
   */
  static async clearCart(userId) {
    const cart = await Cart.findByUser(userId);
    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND,
      };
    }

    // Store coupon info before clearing if exists
    const removedCouponId = cart.appliedCoupon?.couponId;

    // Clear cart - reset items array and coupon
    cart.items = [];
    cart.appliedCoupon = undefined;
    await cart.save();

    // Decrement coupon usage if coupon was applied
    if (removedCouponId) {
      await this.decrementCouponUsage(removedCouponId);
    }

    logger.info(`Cart cleared for user ${userId}, coupon removed`);

    return formatCartResponse(cart);
  }

  /**
   * Decrement coupon usage count
   */
  static async decrementCouponUsage(couponId) {
    try {
      const Coupon = require("../models/coupon.model");
      const coupon = await Coupon.findById(couponId);
      if (coupon && coupon.usedCount > 0) {
        coupon.usedCount -= 1;
        await coupon.save();
      }
    } catch (couponError) {
      logger.warn("Could not decrement coupon usage count:", couponError.message);
    }
  }

  /**
   * Get cart items count
   */
  static async getCartCount(userId) {
    const cart = await Cart.findByUser(userId);
    const count = cart ? cart.items.length : 0;
    const totalQuantities = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    return {
      count,
      totalQuantities,
    };
  }
}

module.exports = CartService;
