// seller-order.controller.js - SELLER FOCUSED (Refactored with Service Layer)
const SellerOrderService = require("../../services/seller/seller-order.service");
const asyncHandler = require("../../middlewares/asyncHandler");
const SellerProfile = require("../../models/seller-profile.model")

class SellerOrderController {
/**
 * PATCH /:orderId/ship - Ship order (seller action) - Updated
 */
static shipOrder = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { courier, estimatedDelivery } = req.body;
    const userId = req.user._id;

    const order = await SellerOrderService.processOrderShipping(
      orderId,
      userId,
      { courier, estimatedDelivery }
    );

    // Clean order response with proper customer data
    const cleanOrderResponse = {
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      shippingInfo: {
        trackingNumber: order.trackingNumber,
        courier: order.courier,
        shippedAt: order.timestamps?.shippedAt,
        estimatedDelivery: order.estimatedDelivery,
      },
      customer: {
        username: order.user?.username || "Unknown",
        email: order.user?.email || "Unknown",
      },
    };

    res.json({
      success: true,
      message:
        "Order shipped successfully. Auto-delivery scheduled in 30 seconds.",
      data: cleanOrderResponse,
    });
  } catch (error) {
    const statusCode = this.getErrorStatusCode(error.message);
    res.status(statusCode).json({
      success: false,
      message: this.getErrorMessage(error.message),
    });
  }
});

/**
 * GET /seller/orders - Get seller orders with filtering
 */
static getSellerOrders = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const queryParams = req.query;

    const result = await SellerOrderService.getSellerOrders(
      userId,
      queryParams
    );

    res.json({
      success: true,
      message: "Seller orders retrieved successfully",
      data: result,
    });
  } catch (error) {
    const statusCode = this.getErrorStatusCode(error.message);
    res.status(statusCode).json({
      success: false,
      message: this.getErrorMessage(error.message),
    });
  }
});

/**
 * GET /seller/reviews - Get reviews for seller's products
 */
static getSellerReviews = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const queryParams = req.query;

  const result = await SellerOrderService.getSellerProductReviews(
    userId,
    queryParams
  );

  res.json({
    success: true,
    message: "Product reviews retrieved successfully",
    data: result,
  });
});

/**
 * GET /seller/reviews/stats - Get review statistics for seller's products
 */
static getSellerReviewStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const queryParams = req.query;

  const stats = await SellerOrderService.getSellerReviewStats(
    userId,
    queryParams
  );

  res.json({
    success: true,
    message: "Review statistics retrieved successfully",
    data: stats,
  });
});

static getSellerEarnings = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const queryParams = req.query;

    const summary = await SellerOrderService.getSellerEarnings(
      userId,
      queryParams
    );

    res.json({
      success: true,
      message: "Earnings summary retrieved successfully",
      data: summary,
    });
  } catch (error) {
    const statusCode = this.getErrorStatusCode(error.message);
    res.status(statusCode).json({
      success: false,
      message: this.getErrorMessage(error.message),
    });
  }
});

/**
 * Helper method to determine HTTP status code based on error
 */
static getErrorStatusCode(errorMessage) {
  switch (errorMessage) {
    case "ORDER_NOT_FOUND":
      return 404;
    case "SELLER_PROFILE_NOT_FOUND":
    case "SELLER_NOT_OWNER":
      return 403;
    case "INVALID_ORDER_STATUS":
      return 400;
    case "ORDER_HAS_PENDING_CANCEL":
      return 400;
    default:
      return 500;
  }
}

/**
 * Helper method to get user-friendly error messages
 */
static getErrorMessage(errorMessage) {
  console.log("Getting error message for:", errorMessage);

  switch (errorMessage) {
    case "ORDER_NOT_FOUND":
      return "Order not found";
    case "SELLER_PROFILE_NOT_FOUND":
      return "Only sellers can access this endpoint";
    case "SELLER_NOT_OWNER":
      return "You can only ship orders containing your products";
    case "INVALID_ORDER_STATUS":
      return "Order must be in 'packed' status to ship";
    case "ORDER_HAS_PENDING_CANCEL":
      return "Cannot ship order with pending cancellation request. Please respond to the cancellation request first.";
    default:
      console.log("Unknown error, returning generic message");
      return `Internal server error: ${errorMessage}`; // TAMBAHKAN ERROR MESSAGE ASLI
  }
}
}

module.exports = SellerOrderController;