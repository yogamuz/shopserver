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
        select: "storeName businessName storeSlug logo",
        model: "SellerProfile",
      },
    ],
  });
};

/**
 * Validate quantity input
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
const formatCartResponse = (cart) => {
  const cartObj = cart.toObject();

  // Calculate totals
  const totalPrice = cart.calculateTotal();
  const finalPrice = cart.calculateFinalPrice();

  // Format items with proper seller information
  cartObj.items = cartObj.items.map((item) => {
    const formattedItem = { ...item };

    if (formattedItem.product) {
      // Rename sellerId to seller and remove sellerId to avoid confusion
      if (formattedItem.product.sellerId) {
        formattedItem.product.seller = formattedItem.product.sellerId;
      } else {
        formattedItem.product.seller = {
          _id: null,
          storeName: "Default Store",
          storeSlug: null,
        };
      }
      delete formattedItem.product.sellerId;
    }

    return formattedItem;
  });

  return {
    ...cartObj,
    totalPrice,
    finalPrice,
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
