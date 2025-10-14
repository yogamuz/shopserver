// order.service.js
const OrderValidationService = require("./order-validation.service");
const OrderResponseFormatter = require("./order-response-formatter.service");
const InventoryService = require("./inventory.service");
const OrderPaymentService = require("./order-payment.service");
const OrderCancellationService = require("./order-cancellation.service");
const OrderDeliveryService = require("./order-delivery.service");
const OrderFeedbackService = require("./order-feedback.service");
const Order = require("../../models/order.model");
const Cart = require("../../models/cart.model");
const logger = require("../../utils/logger");

class OrderService {
  /**
   * Create order from cart
   */
  static async createOrder(userId, orderData) {
    const { paymentMethod, notes = "", address_id } = orderData;

    const validationResult = await OrderValidationService.validateOrderCreation(userId, { paymentMethod, address_id });

    if (!validationResult.isValid) {
      const error = new Error(validationResult.message);
      error.statusCode = 400;
      throw error;
    }

    const { shippingAddress, cart } = validationResult.data;

    await InventoryService.validateStock(cart.items);
    const stockValidation = await InventoryService.validateStockForOrder(cart.items);

    if (!stockValidation.isValid) {
      if (stockValidation.hasAvailabilityIssues) {
        const error = new Error("Some products are no longer available for purchase");
        error.statusCode = 400;
        error.data = {
          unavailableProducts: stockValidation.issues.filter(issue =>
            ["PRODUCT_NOT_FOUND", "PRODUCT_INACTIVE", "PRODUCT_DELETED"].includes(issue.issue)
          ),
        };
        throw error;
      }

      if (stockValidation.hasStockIssues) {
        const error = new Error("Insufficient stock for some products");
        error.statusCode = 400;
        error.data = {
          stockIssues: stockValidation.issues.filter(issue => issue.issue === "INSUFFICIENT_STOCK"),
        };
        throw error;
      }

      const error = new Error("Product validation failed");
      error.statusCode = 400;
      error.data = { issues: stockValidation.issues };
      throw error;
    }

    const totalAmount = cart.calculateFinalPrice();
    const cartData = OrderResponseFormatter.formatCartData(cart, totalAmount);

    const order = await Order.createFromCart(userId, cartData, {
      shippingAddress,
      paymentMethod,
      notes,
    });

    await order.populate("user", "username email");

    return {
      success: true,
      message: "Order created successfully",
      data: this.formatCreateOrderResponse(order),
    };
  }

  static formatCreateOrderResponse(order) {
    const totalAmount = order.cartSnapshot.finalPrice;
    const sellerMap = new Map();

    order.cartSnapshot.items.forEach(item => {
      const sellerId = item.productSnapshot.seller._id.toString();

      if (!sellerMap.has(sellerId)) {
        sellerMap.set(sellerId, {
          storeName: item.productSnapshot.seller.storeName,
          storeLogo: item.productSnapshot.seller.storeLogo,
          storeSlug: item.productSnapshot.seller.storeSlug,
          items: [],
        });
      }

      sellerMap.get(sellerId).items.push({
        productId: item.product,
        productName: item.productSnapshot.title,
        productImage: item.productSnapshot.image,
        quantity: item.quantity,
        price: item.priceAtPurchase,
        subtotal: item.priceAtPurchase * item.quantity,
        status: "pending",
      });
    });

    const responseData = {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: totalAmount,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      expiresInMinutes: 30,
      sellers: Array.from(sellerMap.values()),
      paymentInfo: {
        method: "ShopPay",
        amount: totalAmount,
        status: "pending",
      },
    };

    if (order.cartSnapshot.appliedCoupon) {
      responseData.couponApplied = {
        code: order.cartSnapshot.appliedCoupon.code,
        discountAmount: order.cartSnapshot.appliedCoupon.discountAmount,
      };
    }

    return responseData;
  }

  /**
   * Pay for order
   */
  static async payOrder(orderId, userId, pin) {
    return await OrderPaymentService.payOrder(orderId, userId, pin);
  }

  /**
   * Validate payment
   */
  static async validatePayment(userId, orderId) {
    return await OrderPaymentService.validatePayment(userId, orderId);
  }

  /**
   * Get user orders
   */
  static async getUserOrders(userId, queryParams) {
    const {
      page = 1,
      limit = 10,
      status,
      orderStatus,
      sellerStatus,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = queryParams;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = { user: userId };
    let orders = [];
    let total = 0;

    // Handle cancellation_requested status
    if (status === "cancellation_requested") {
      const CancelRequest = require("../../models/cancel-request.model");

      const cancelRequests = await CancelRequest.find({
        userId: userId,
        status: "pending",
      }).select("orderId");

      const orderIds = cancelRequests.map(cr => cr.orderId);

      if (orderIds.length === 0) {
        orders = [];
        total = 0;
      } else {
        query._id = { $in: orderIds };
        const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

        const [ordersResult, totalResult] = await Promise.all([
          Order.find(query)
            .sort(sort)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .populate("user", "username email")
            .lean(),
          Order.countDocuments(query),
        ]);

        orders = ordersResult;
        total = totalResult;
      }
    } else {
      // Normal query
      if (orderStatus) {
        const statusValues = orderStatus.includes(",") ? orderStatus.split(",").map(s => s.trim()) : [orderStatus];
        query.status = { $in: statusValues };
      }

      if (status) {
        const statusValues = status.includes(",") ? status.split(",").map(s => s.trim()) : [status.trim()];
        query["itemStatuses.status"] = { $in: statusValues };
      }

      if (sellerStatus) {
        const statusValues = sellerStatus.includes(",")
          ? sellerStatus.split(",").map(s => s.trim())
          : [sellerStatus.trim()];
        query["itemStatuses.status"] = { $in: statusValues };
      }

      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const [ordersResult, totalResult] = await Promise.all([
        Order.find(query)
          .sort(sort)
          .limit(limitNum)
          .skip((pageNum - 1) * limitNum)
          .populate("user", "username email")
          .lean(),
        Order.countDocuments(query),
      ]);

      orders = ordersResult;
      total = totalResult;
    }

    // Format response
    let formattedOrders = OrderResponseFormatter.formatOrderListResponse(orders, {
      filterSellerStatus: status ? status.split(",").map(s => s.trim()) : null,
      includeStoreLogo: true,
    });

    if (status === "cancellation_requested") {
      formattedOrders = formattedOrders.map(order => ({
        ...order,
        status: "cancellation_requested",
        statusInfo: {
          ...order.statusInfo,
          status: "cancellation_requested",
          displayStatus: "Permintaan Pembatalan",
        },
      }));
    }

    return {
      success: true,
      message: "Orders retrieved successfully",
      data: {
        orders: formattedOrders,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalOrders: total,
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1,
        },
      },
    };
  }

  /**
   * Get order details
   */
static async getOrderById(orderId, userId) {
  let order = await Order.findOne({
    _id: orderId,
    user: userId,
  }).populate("user", "username email");

  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  order = await this.populateOrderReviews(order, userId);

  // ✅ NEW: Fetch cancel request reason jika order dalam status cancellation_requested
  if (order.status === "cancellation_requested") {
    const CancelRequest = require("../../models/cancel-request.model");
    const cancelRequest = await CancelRequest.findOne({
      orderId: order._id,
      status: "pending",
    }).select("generalReason itemsToCancel createdAt status");

    if (cancelRequest) {
      // Attach cancel request data ke order
      if (!order.cancelRequest) {
        order.cancelRequest = {};
      }
      order.cancelRequest.reason = cancelRequest.generalReason;
      order.cancelRequest.generalReason = cancelRequest.generalReason;
      order.cancelRequest.itemsToCancel = cancelRequest.itemsToCancel.length;
      order.cancelRequest.submittedAt = cancelRequest.createdAt;
      order.cancelRequest.status = cancelRequest.status;
    }
  }

  const formattedOrder = OrderResponseFormatter.formatOrderResponse(order, true, true);

  // ✅ Ensure cancelRequest reason included di formatted response
  if (order.cancelRequest?.reason) {
    formattedOrder.cancelRequest = {
      ...formattedOrder.cancelRequest,
      reason: order.cancelRequest.reason,
      generalReason: order.cancelRequest.generalReason,
    };
  }

  return {
    success: true,
    message: "Order details retrieved successfully",
    data: formattedOrder,
  };
}

  /**
   * Cancel order
   */
  static async cancelOrder(orderId, userId, cancelData) {
    return await OrderCancellationService.cancelOrder(orderId, userId, cancelData);
  }

  /**
   * Confirm items delivery
   */
  static async confirmItemsDelivery(orderId, userId, confirmData = {}) {
    return await OrderDeliveryService.confirmItemsDelivery(orderId, userId, confirmData);
  }

  /**
   * Update order feedback
   */
  static async updateOrderFeedback(orderId, userId, feedbackData) {
    return await OrderFeedbackService.updateOrderFeedback(orderId, userId, feedbackData);
  }

  /**
   * Update product review
   */
  static async updateProductReview(orderId, productId, userId, feedbackData) {
    return await OrderFeedbackService.updateProductReview(orderId, productId, userId, feedbackData);
  }

  /**
   * Populate order reviews
   */
  static async populateOrderReviews(order, userId) {
    const Review = require("../../models/review.model");

    if (!order.cartSnapshot?.items) return order;

    const productIds = order.cartSnapshot.items.map(item => item.product);

    const reviews = await Review.find({
      userId: userId,
      productId: { $in: productIds },
    }).lean();

    for (let i = 0; i < order.cartSnapshot.items.length; i++) {
      const item = order.cartSnapshot.items[i];
      const review = reviews.find(r => r.productId.toString() === item.product.toString());

      if (review) {
        order.cartSnapshot.items[i].customerFeedback = {
          rating: review.rating || null,
          review: review.comment || null,
          submittedAt: review.createdAt || null,
          updatedAt: review.updatedAt || null,
        };
      }
    }

    order.markModified("cartSnapshot.items");
    return order;
  }

  /**
   * Check expired orders
   */
  static async checkExpiredOrders() {
    return await OrderDeliveryService.checkExpiredOrders();
  }

  static startExpirationChecker() {
    setInterval(async () => {
      try {
        await this.checkExpiredOrders();
      } catch (error) {
        logger.error("Expiration checker error:", error);
      }
    }, 0.25 * 60 * 1000);

    logger.info("Order expiration checker started - checking every 15 seconds");
  }

  static startAutoReceiveChecker() {
    setInterval(async () => {
      try {
        await Order.checkAutoReceiveOrders();
      } catch (error) {
        logger.error("Auto-receive checker error:", error);
      }
    }, 30 * 60 * 1000);

    logger.info("Auto-receive checker started - checking every 30 minutes");
  }
}

module.exports = OrderService;