// utils/cartUtils.js
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");

/**
 * Populate cart items with product and category details
 */
const populateCart = async (cart) => {
  return await cart.populate({
    path: "items.product",
    select: "title price image category description stock sellerId",
    populate: [
      {
        path: "category",
        select: "name description image",
      },
      {
        path: "sellerId",
        select: "storeName storeSlug logo",
        model: "SellerProfile",
      },
    ],
  });
};

/**
 * Validate quantity inputa
 */
const validateQuantity = (quantity) => {
  if (!quantity || quantity < 0) {
    return {
      isValid: false,
      error: {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.QUANTITY_REQUIRED,
      },
    };
  }

  // Validate quantity is not decimal/float
  if (quantity % 1 !== 0) {
    return {
      isValid: false,
      error: {
        status: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.CART.INVALID_QUANTITY,
      },
    };
  }

  return { isValid: true };
};

/**
 * Validate stock availability
 */
const validateStock = (
  product,
  requestedQuantity,
  currentQuantityInCart = 0
) => {
  const totalRequestedQuantity = currentQuantityInCart + requestedQuantity;

  if (totalRequestedQuantity > product.stock) {
    const availableStock = product.stock - currentQuantityInCart;
    return {
      isValid: false,
      error: {
        status: HTTP_STATUS.BAD_REQUEST,
        message:
          availableStock <= 0
            ? MESSAGES.CART.STOCK_UNAVAILABLE
            : `${MESSAGES.CART.INSUFFICIENT_STOCK} ${availableStock}, stock di cart: ${currentQuantityInCart}`,
        data: {
          availableStock,
          currentInCart: currentQuantityInCart,
          requestedQuantity,
          productStock: product.stock,
        },
      },
    };
  }

  return { isValid: true };
};

/**
 * Validate stock for update operation
 */
const validateStockForUpdate = (product, quantity) => {
  if (quantity > 0 && quantity > product.stock) {
    return {
      isValid: false,
      error: {
        status: HTTP_STATUS.BAD_REQUEST,
        message: `${MESSAGES.CART.INSUFFICIENT_STOCK} ${product.stock}`,
        data: {
          availableStock: product.stock,
          requestedQuantity: quantity,
          productStock: product.stock,
        },
      },
    };
  }

  return { isValid: true };
};

/**
 * Calculate cart totals
 */
const calculateCartTotals = (cart) => {
  const totalPrice = cart.items.reduce((sum, item) => {
    return sum + item.priceAtAddition * item.quantity;
  }, 0);

  const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  let finalPrice = totalPrice;
  if (cart.appliedCoupon?.discountAmount) {
    finalPrice = Math.max(0, totalPrice - cart.appliedCoupon.discountAmount);
  }

  return {
    totalItems,
    totalPrice,
    finalPrice,
  };
};

// PERBAIKAN: Pastikan konsistensi perhitungan
const formatCartResponse = (cart) => {
  if (!cart) return null;

  // PERBAIKAN: Gunakan method yang sudah ada di cart model
  const subtotal = cart.calculateTotal();
  const totalItems = cart.totalItems;
  const discount = cart.appliedCoupon ? cart.appliedCoupon.discountAmount : 0;
  const finalPrice = cart.calculateFinalPrice(); // PERBAIKAN: Gunakan method yang sudah ada

  return {
    id: cart._id,
    userId: cart.user,
    status: cart.isActive ? "active" : "inactive",
    items: cart.items.map(item => {
      const currentPrice = item.product?.price || item.priceAtAddition;
      
      return {
        id: item._id,
        productId: item.product._id,
        quantity: item.quantity,
        unitPrice: currentPrice,
        totalPrice: currentPrice * item.quantity,
        addedAt: item.addedAt || cart.updatedAt,
        product: {
          id: item.product._id,
          title: item.product.title,
          description: item.product.description,
          currentPrice: item.product.price,
          stock: item.product.stock,
          slug: item.product.slug,
          image: {
            url: item.product.image || null,
            alt: item.product.title || "Product Image"
          },
          category: item.product.category ? {
            id: item.product.category._id,
            name: item.product.category.name,
            description: item.product.category.description,
            slug: item.product.category.slug
          } : null,
          seller: item.product.sellerId ? {
            id: item.product.sellerId._id || item.product.sellerId,
            name: item.product.sellerId.storeName || item.product.sellerId.name,
            slug: item.product.sellerId.storeSlug || item.product.sellerId.slug,
            logo: {
              url: item.product.sellerId.logo || null,
              alt: `${item.product.sellerId.storeName || item.product.sellerId.name || 'Store'} Logo`
            }
          } : null
        }
      };
    }),
    summary: {
      totalItems,
      itemsCount: cart.items.length,
      subtotal,
      discount,
      total: finalPrice, // PERBAIKAN: Gunakan finalPrice yang sudah dihitung dengan benar
      currency: "IDR",
      savings: discount > 0 ? discount : 0
    },
    appliedCoupon: cart.appliedCoupon ? {
      id: cart.appliedCoupon.couponId,
      code: cart.appliedCoupon.code,
      type: cart.appliedCoupon.discount ? 'percentage' : 'fixed',
      value: cart.appliedCoupon.discount || cart.appliedCoupon.discountAmount,
      discountAmount: cart.appliedCoupon.discountAmount,
      maxDiscount: cart.appliedCoupon.maxDiscount,
      appliedAt: cart.appliedCoupon.appliedAt
    } : null,
    timestamps: {
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt
    },
    meta: {
      version: "1.0.0",
      hasDiscount: discount > 0,
      isEmpty: cart.items.length === 0,
      lastActivity: cart.updatedAt
    }
  };
};

module.exports = {
  populateCart,
  validateQuantity,
  validateStock,
  validateStockForUpdate,
  calculateCartTotals,
  formatCartResponse,
};
