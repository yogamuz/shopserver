// services/cartService.js
const Cart = require('../models/cart.model');
const Product = require('../models/products.model');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');
const { 
  populateCart, 
  validateQuantity, 
  validateStock, 
  validateStockForUpdate,
  formatCartResponse 
} = require('../utils/cart.util');
const logger = require('../utils/logger');

class CartService {
  /**
   * Get user's cart with populated data
   */
  static async getUserCart(userId) {
    let cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      select: 'title price image category',
      populate: {
        path: 'category',
        select: 'name description image'
      }
    });

    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND
      };
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
        message: MESSAGES.PRODUCT.NOT_FOUND
      };
    }

    // Find or create cart
    let cart = await Cart.findByUser(userId);
    if (!cart) {
      cart = new Cart({ user: userId });
    }

    // Check if product already exists in cart
    const existingItem = cart.items.find(item => 
      item.product.toString() === productId.toString()
    );

    const currentQuantityInCart = existingItem ? existingItem.quantity : 0;

    // Validate stock
    const stockValidation = validateStock(product, quantity, currentQuantityInCart);
    if (!stockValidation.isValid) {
      throw stockValidation.error;
    }

    // Add item to cart
    await cart.addProduct(productId, quantity, product.price);

    // Populate and return cart
    await populateCart(cart);

   logger.info(`✅ Item added to cart: ${product.title} (qty: ${quantity})`);

    return cart;
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
        message: MESSAGES.PRODUCT.NOT_FOUND
      };
    }

    // Get cart without populate first
    const cart = await Cart.findOne({ user: userId, isActive: true });
    if (!cart) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.NOT_FOUND
      };
    }

    // Find item in cart
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      throw {
        status: HTTP_STATUS.NOT_FOUND,
        message: MESSAGES.CART.ITEM_NOT_FOUND
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
     logger.info('✅ Item removed from cart');
    } else {
      cart.items[itemIndex].quantity = quantity;
     logger.info('✅ Item quantity updated');
    }

    // Save cart
    await cart.save();

    // Populate for response
    await populateCart(cart);

   logger.info(`✅ Cart item updated: ${productId} (qty: ${quantity})`);

    return {
      cart,
      isRemoved: quantity === 0
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
        message: MESSAGES.CART.NOT_FOUND
      };
    }

    // Remove item
    await cart.removeProduct(productId);

    // Populate for response
    await populateCart(cart);

   logger.info(`✅ Item removed from cart: ${productId}`);

    return cart;
  }

  /**
   * Clear entire cart
   */
static async clearCart(userId) {
  const cart = await Cart.findByUser(userId);
  if (!cart) {
    throw {
      status: HTTP_STATUS.NOT_FOUND,
      message: MESSAGES.CART.NOT_FOUND
    };
  }

  // Clear cart - reset items array and coupon
  cart.items = [];
  cart.appliedCoupon = null; // atau cart.couponId = null, tergantung struktur schema
  cart.discount = 0; // reset discount jika ada field ini
  await cart.save();

 logger.info(`✅ Cart cleared for user ${userId}, coupon removed`);

  return cart;
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
      totalQuantities
    };
  }
}

module.exports = CartService;