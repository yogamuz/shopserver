// order.controller.js - Updated dengan Global Error Handler
const OrderService = require("../../services/order/order.service");
const asyncHandler = require("../../middlewares/asyncHandler");

class OrderController {
  /**
   * POST / - Create order from cart (status: pending)
   */
  static createOrder = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const orderData = req.body;

    const result = await OrderService.createOrder(userId, orderData);
    res.status(201).json(result);
  });

  /**
   * POST /:orderId/payment - Pay for order with ShopPay
   */
  static payOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user._id;
    const { pin } = req.body;

    const result = await OrderService.payOrder(orderId, userId, pin);
    res.json(result);
  });

  /**
   * GET / - Get user orders
   */
  static getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const queryParams = req.query;

    const result = await OrderService.getUserOrders(userId, queryParams);
    res.json(result);
  });

  /**
   * GET /:orderId - Get order details
   */
  static getOrderById = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user._id;

    const result = await OrderService.getOrderById(orderId, userId);
    res.json(result);
  });

  /**
   * PATCH /:orderId/cancel - Cancel order
   */
static cancelOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id;
  
  // Service handle semua logic
  const result = await OrderService.cancelOrder(
    orderId, 
    userId, 
    req.body  // pass everything
  );
  res.json(result);
});

  /**
   * GET /:orderId/payment/validate - Validate payment before paying order
   */
  static validatePayment = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user._id;

    const result = await OrderService.validatePayment(userId, orderId);
    res.json(result);
  });

/**
 * PATCH /:orderId/items/received - Dynamic confirm delivery (product/parcel/all)
 */
static confirmItemsDelivery = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id;
  const { productIds, sellerId, rating, review } = req.body;

  // Validate rating if provided
  if (rating && (rating < 1 || rating > 5)) {
    const error = new Error("Rating must be between 1 and 5");
    error.statusCode = 400;
    throw error;
  }

  // Validate review if provided
  if (review && review.trim().length < 10) {
    const error = new Error("Review must be at least 10 characters if provided");
    error.statusCode = 400;
    throw error;
  }

  if (review && review.trim().length > 1000) {
    const error = new Error("Review cannot exceed 1000 characters");
    error.statusCode = 400;
    throw error;
  }

  const result = await OrderService.confirmItemsDelivery(
    orderId,
    userId,
    {
      productIds: productIds || null,
      sellerId: sellerId || null,
      rating: rating ? Number(rating) : null,
      review: review ? review.trim() : null,
    }
  );

  res.json(result);
});




  /**
   * PATCH /:orderId/feedback - Update order feedback after delivery
   */
static updateOrderFeedback = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id;
  const { rating, review, productReviews } = req.body;

  // Validate legacy format
  if (rating && (rating < 1 || rating > 5)) {
    const error = new Error("Rating must be between 1 and 5");
    error.statusCode = 400;
    throw error;
  }

  if (review && review.trim().length < 10) {
    const error = new Error("Review must be at least 10 characters if provided");
    error.statusCode = 400;
    throw error;
  }

  if (review && review.trim().length > 1000) {
    const error = new Error("Review cannot exceed 1000 characters");
    error.statusCode = 400;
    throw error;
  }

  // Validate productReviews array format
  if (productReviews) {
    if (!Array.isArray(productReviews)) {
      const error = new Error("Product reviews must be an array");
      error.statusCode = 400;
      throw error;
    }

    for (const productReview of productReviews) {
      const { productId, rating: productRating, comment: productComment } = productReview;

      if (!productId) {
        const error = new Error("Product ID is required for product reviews");
        error.statusCode = 400;
        throw error;
      }

      if (productRating && (productRating < 1 || productRating > 5)) {
        const error = new Error("Product rating must be between 1 and 5");
        error.statusCode = 400;
        throw error;
      }

      if (productComment && productComment.trim().length < 10) {
        const error = new Error("Product review comment must be at least 10 characters if provided");
        error.statusCode = 400;
        throw error;
      }

      if (productComment && productComment.trim().length > 1000) {
        const error = new Error("Product review comment cannot exceed 1000 characters");
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const result = await OrderService.updateOrderFeedback(orderId, userId, {
    rating: rating ? Number(rating) : null,
    review: review ? review.trim() : null,
    productReviews: productReviews || null,
  });

  res.json(result);
});

/**
 * PATCH /:orderId/items/:productId/review - Update individual product review
 */
static updateProductReview = asyncHandler(async (req, res) => {
  const { orderId, productId } = req.params;
  const userId = req.user._id;
  const { rating, review } = req.body;

  // Validate rating if provided
  if (rating && (rating < 1 || rating > 5)) {
    const error = new Error("Rating must be between 1 and 5");
    error.statusCode = 400;
    throw error;
  }

  // Validate review if provided
  if (review && review.trim().length < 10) {
    const error = new Error("Review must be at least 10 characters if provided");
    error.statusCode = 400;
    throw error;
  }

  if (review && review.trim().length > 1000) {
    const error = new Error("Review cannot exceed 1000 characters");
    error.statusCode = 400;
    throw error;
  }

  const result = await OrderService.updateProductReview(
    orderId,
    productId,
    userId,
    {
      rating: rating ? Number(rating) : null,
      review: review ? review.trim() : null,
    }
  );

  res.json(result);
});


}

module.exports = OrderController;