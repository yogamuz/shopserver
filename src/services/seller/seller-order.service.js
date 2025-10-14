// seller-order.service.js - Business logic layer for seller orders
const Order = require("../../models/order.model");
const Wallet = require("../../models/wallet.model");
const WalletTransaction = require("../../models/wallet-transaction.model");
const SellerProfile = require("../../models/seller-profile.model");

class SellerOrderService {
  /**
   * Validate seller ownership of order
   */
  static async validateSellerOwnership(orderId, userId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      throw new Error("SELLER_PROFILE_NOT_FOUND");
    }

    const sellerOwnsProduct = order.cartSnapshot.items.some(
      item => item.productSnapshot.seller && item.productSnapshot.seller._id.equals(sellerProfile._id)
    );

    if (!sellerOwnsProduct) {
      throw new Error("SELLER_NOT_OWNER");
    }

    return { order, sellerProfile };
  }
  /**
   * Check if order has pending cancellation request
   */
  static async hasPendingCancelRequest(orderId) {
    const CancelRequest = require("../../models/cancel-request.model");

    const pendingRequest = await CancelRequest.findOne({
      orderId: orderId,
      status: "pending",
    });

    return !!pendingRequest;
  }

  static async processOrderShipping(orderId, userId, shippingDetails) {
    const { courier, estimatedDelivery } = shippingDetails;
    let { trackingNumber } = shippingDetails;

    const { order, sellerProfile } = await this.validateSellerOwnership(orderId, userId);
    const hasPendingCancel = await this.hasPendingCancelRequest(orderId);
    if (hasPendingCancel) {
      throw new Error("ORDER_HAS_PENDING_CANCEL");
    }

    // ✅ FIX: Check seller's item status instead of order.status
    const sellerItemStatuses =
      order.itemStatuses?.filter(item => item.sellerId.toString() === sellerProfile._id.toString()) || [];

    // Determine seller's current status
    let sellerCurrentStatus;
    if (sellerItemStatuses.length > 0) {
      sellerCurrentStatus = sellerItemStatuses[0].status;
    } else {
      // If itemStatuses not initialized yet, check payment status
      sellerCurrentStatus = order.paymentStatus === "paid" ? "packed" : "pending";
    }

    // ✅ Validate seller's item status (not order status)
    if (sellerCurrentStatus !== "packed") {
      throw new Error("INVALID_ORDER_STATUS");
    }

    if (!trackingNumber) {
      trackingNumber = this.generateTrackingNumber();
    }

    // Initialize itemStatuses jika belum ada
    if (!order.itemStatuses || order.itemStatuses.length === 0) {
      order.itemStatuses = order.cartSnapshot.items.map(item => ({
        product: item.product,
        sellerId: item.productSnapshot.seller._id,
        status: order.paymentStatus === "paid" ? "packed" : "pending",
        timestamps: {},
      }));
    }

    // Update status untuk item milik seller ini saja
    const updatedItemStatuses = order.itemStatuses.map(itemStatus => {
      if (itemStatus.sellerId.toString() === sellerProfile._id.toString()) {
        return {
          ...(itemStatus.toObject ? itemStatus.toObject() : itemStatus),
          status: "shipped",
          trackingNumber,
          courier,
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
          timestamps: {
            ...itemStatus.timestamps,
            shippedAt: new Date(),
          },
        };
      }
      return itemStatus.toObject ? itemStatus.toObject() : itemStatus;
    });

    order.itemStatuses = updatedItemStatuses;

    // ✅ Update order-level status hanya jika semua seller sudah shipped
    const allShipped = updatedItemStatuses.every(item => ["shipped", "delivered", "received"].includes(item.status));

    if (allShipped) {
      order.status = "shipped";
      order.timestamps.shippedAt = new Date();

      if (!order.tracking) order.tracking = {};
      order.tracking.trackingNumber = trackingNumber;
      order.tracking.courier = courier;
      if (estimatedDelivery) {
        order.tracking.estimatedDelivery = new Date(estimatedDelivery);
      }
    }

    await order.populate("user", "username email");
    await order.save();

    this.scheduleAutoDeliveryPerSeller(orderId, sellerProfile._id);
    return order;
  }

  /**
   * Generate automatic tracking number
   */
  static generateTrackingNumber() {
    const randomNumber = Math.floor(Math.random() * 1000000000000)
      .toString()
      .padStart(12, "0");
    return `SP-${randomNumber}`;
  }

  static scheduleAutoDeliveryPerSeller(orderId, sellerId) {
    setTimeout(async () => {
      try {
        const currentOrder = await Order.findById(orderId);
        if (currentOrder) {
          await this.processAutoDeliveryPerSeller(currentOrder, sellerId);
        }
      } catch (error) {
        console.error("Auto-delivery error for seller items:", orderId, sellerId, error);
      }
    }, 0.5 * 60 * 1000); // 30 seconds for demo
  }

  static async processAutoDeliveryPerSeller(order, sellerId) {
    try {
      const updatedItemStatuses = order.itemStatuses.map(itemStatus => {
        if (itemStatus.sellerId.toString() === sellerId.toString() && itemStatus.status === "shipped") {
          return {
            ...itemStatus,
            status: "delivered",
            timestamps: {
              ...itemStatus.timestamps,
              deliveredAt: new Date(),
            },
          };
        }
        return itemStatus;
      });

      order.itemStatuses = updatedItemStatuses;

      // ✅ FIX: Update order-level status ke "delivered"
      const allDelivered = updatedItemStatuses.every(item => item.status === "delivered");
      if (allDelivered) {
        order.status = "delivered";
        order.timestamps.deliveredAt = new Date();
      }

      await order.save();

      console.log(`Seller ${sellerId} items in order ${order.orderNumber} auto-delivered.`);
    } catch (error) {
      console.error("Auto-delivery process failed:", error);
      throw error;
    }
  }

  /**
   * Process seller payments after delivery
   */
  static async processSellerPayments(order) {
    const pendingTransactions = await WalletTransaction.find({
      orderId: order._id,
      type: "receive_pending",
      status: "completed",
    });

    for (const transaction of pendingTransactions) {
      await this.confirmSellerPayment(transaction, order);
    }
  }

  /**
   * Confirm individual seller payment
   */
  static async confirmSellerPayment(transaction, order) {
    const sellerWallet = await Wallet.findByUser(transaction.userId);

    if (sellerWallet && sellerWallet.pendingBalance >= transaction.amount) {
      await sellerWallet.confirmPendingBalance(transaction.amount, `Order delivered: ${order.orderNumber}`);

      await WalletTransaction.create({
        userId: transaction.userId,
        type: "receive_confirmed",
        amount: transaction.amount,
        description: `Payment confirmed - Order ${order.orderNumber} delivered`,
        orderId: order._id,
        balanceAfter: sellerWallet.balance,
        pendingBalanceAfter: sellerWallet.pendingBalance,
        metadata: {
          source: "auto_delivery",
          originalTransactionId: transaction._id,
        },
      });
    }
  }

  /**
   * Get seller orders with filtering and pagination - UPDATED with aggregate pipeline
   */
  static async getSellerOrders(userId, queryParams) {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
      startDate,
      endDate,
      customer,
      productName,
    } = queryParams;

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      throw new Error("SELLER_PROFILE_NOT_FOUND");
    }

    const pipeline = [];

    // Stage 1: Match seller orders
    const matchStage = {
      "cartSnapshot.items.productSnapshot.seller._id": sellerProfile._id,
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        matchStage.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = endOfDay;
      }
    }

    if (productName) {
      matchStage["cartSnapshot.items.productSnapshot.title"] = {
        $regex: productName,
        $options: "i",
      };
    }

    pipeline.push({ $match: matchStage });

    // Stage 2: Add seller item status field
    pipeline.push({
      $addFields: {
        sellerItemStatus: {
          $cond: {
            if: { $isArray: "$itemStatuses" },
            then: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$itemStatuses",
                    as: "item",
                    cond: { $eq: ["$$item.sellerId", sellerProfile._id] },
                  },
                },
                0,
              ],
            },
            else: null,
          },
        },
      },
    });

    // Stage 3: Filter by seller item status (if status filter provided)
    if (status) {
      pipeline.push({
        $match: {
          $or: [
            { "sellerItemStatus.status": status },
            {
              $and: [{ sellerItemStatus: null }, { paymentStatus: "paid" }, { $expr: { $eq: [status, "packed"] } }],
            },
          ],
        },
      });
    }

    // Conditional user lookup
    if (customer) {
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo",
          pipeline: [
            {
              $match: {
                $or: [
                  { username: { $regex: customer, $options: "i" } },
                  { email: { $regex: customer, $options: "i" } },
                ],
              },
            },
            { $project: { username: 1, email: 1 } },
          ],
        },
      });

      pipeline.push({
        $match: {
          userInfo: { $ne: [] },
        },
      });

      pipeline.push({
        $unwind: "$userInfo",
      });
    } else {
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo",
          pipeline: [{ $project: { username: 1, email: 1 } }],
        },
      });

      pipeline.push({
        $unwind: {
          path: "$userInfo",
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    pipeline.push({
      $addFields: {
        user: "$userInfo",
      },
    });

    pipeline.push({
      $unset: ["userInfo", "sellerItemStatus"],
    });

    // Sort
    const sortStage = {};
    sortStage[sortBy] = sortOrder === "desc" ? -1 : 1;
    pipeline.push({ $sort: sortStage });

    // Facet for pagination
    const facetPipeline = [
      ...pipeline,
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit * 1 }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await Order.aggregate(facetPipeline);

    const orders = result.data || [];
    const total = result.totalCount[0]?.count || 0;

    const transformedOrders = await this.transformOrdersForSellerFast(orders, sellerProfile._id, userId);

    return {
      orders: transformedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      filters: {
        ...(status && { status }),
        ...(customer && { customer }),
        ...(productName && { productName }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        sortBy,
        sortOrder,
      },
    };
  }

  // 2️⃣ UPDATE transformOrdersForSellerFast - PASS sellerProfileId
  static async transformOrdersForSellerFast(orders, sellerProfileId, userId) {
    if (!orders.length) return [];

    const orderIds = orders.map(order => order._id);

    const paymentTransactions = await WalletTransaction.find({
      userId: userId,
      orderId: { $in: orderIds },
      type: { $in: ["receive_pending", "receive_confirmed"] },
    })
      .select("orderId type amount createdAt")
      .lean();

    const paymentMap = new Map();

    paymentTransactions.forEach(tx => {
      const orderId = tx.orderId.toString();
      if (!paymentMap.has(orderId)) {
        paymentMap.set(orderId, { pending: null, confirmed: null });
      }

      const orderPayments = paymentMap.get(orderId);
      if (tx.type === "receive_pending") {
        orderPayments.pending = tx;
      } else if (tx.type === "receive_confirmed") {
        orderPayments.confirmed = tx;
      }
    });

    return orders.map(order => {
      const sellerItems = order.cartSnapshot.items.filter(
        item => item.productSnapshot.seller && item.productSnapshot.seller._id.toString() === sellerProfileId.toString()
      );

      const orderObj = order;
      // Tidak mengubah orderObj.cartSnapshot.items karena kita perlu semua items untuk context

      const sellerEarnings = this.calculateSellerEarnings(sellerItems, order.cartSnapshot.appliedCoupon);

      const orderId = order._id.toString();
      const payments = paymentMap.get(orderId) || {
        pending: null,
        confirmed: null,
      };

      let paymentStatus = "not_paid";
      if (payments.confirmed) {
        paymentStatus = "confirmed";
      } else if (payments.pending) {
        paymentStatus = "pending";
      }

      const paymentInfo = {
        paymentStatus,
        pendingTransaction: payments.pending,
        confirmedTransaction: payments.confirmed,
      };

      return this.formatOrderResponseFast(orderObj, sellerItems, sellerEarnings, paymentInfo, sellerProfileId);
    });
  }
  static formatOrderResponseFast(orderObj, sellerItems, sellerEarnings, paymentInfo, sellerProfileId) {
    const originalEarnings = sellerItems.reduce((total, item) => total + item.priceAtPurchase * item.quantity, 0);

    const sellerItemStatuses =
      orderObj.itemStatuses?.filter(item => item.sellerId.toString() === sellerProfileId.toString()) || [];

    let sellerStatus;
    if (sellerItemStatuses.length > 0) {
      sellerStatus = sellerItemStatuses[0].status;
    } else {
      sellerStatus = orderObj.paymentStatus === "paid" ? "packed" : "pending";
    }

    let customerFeedbackData = null;

    if (sellerStatus === "received" && orderObj.customerFeedback) {
      if (orderObj.customerFeedback.hasProductReviews) {
        customerFeedbackData = {
          hasProductReviews: true,
          productReviewsCount: orderObj.customerFeedback.productReviewsCount || 0,
          submittedAt: orderObj.customerFeedback.submittedAt,
        };
      } else if (orderObj.customerFeedback.rating || orderObj.customerFeedback.review) {
        customerFeedbackData = {
          rating: orderObj.customerFeedback.rating,
          review: orderObj.customerFeedback.review,
          submittedAt: orderObj.customerFeedback.submittedAt,
        };
      }
    }

    return {
      id: orderObj._id.toString(),
      orderNumber: orderObj.orderNumber,
      status: sellerStatus,
      paymentStatus: orderObj.paymentStatus || "paid",
      totalAmount: sellerEarnings,
      totalItems: sellerItems.length,
      createdAt: orderObj.createdAt,

      customer: {
        username: orderObj.user?.username || "Unknown",
        email: orderObj.user?.email || "Unknown",
      },

      shippingAddress: {
        fullAddress: `${orderObj.shippingAddress?.street}, ${orderObj.shippingAddress?.city}, ${orderObj.shippingAddress?.state} ${orderObj.shippingAddress?.zipCode}, ${orderObj.shippingAddress?.country}`,
        street: orderObj.shippingAddress?.street,
        city: orderObj.shippingAddress?.city,
        state: orderObj.shippingAddress?.state,
        zipCode: orderObj.shippingAddress?.zipCode,
        country: orderObj.shippingAddress?.country,
      },

      items: sellerItems.map(item => {
        const itemStatus = sellerItemStatuses.find(s => s.product.toString() === item.product.toString());
        return {
          productId: item.product.toString(),
          productName: item.productSnapshot.title,
          productImage: item.productSnapshot.image,
          quantity: item.quantity,
          pricePerUnit: item.priceAtPurchase,
          subtotal: item.priceAtPurchase * item.quantity,
          status: itemStatus?.status || sellerStatus,
        };
      }),

      timestamps: {
        orderedAt: orderObj.timestamps?.orderedAt || orderObj.createdAt,
        ...(orderObj.paymentDetails?.paidAt && { paidAt: orderObj.paymentDetails.paidAt }),
        ...(sellerItemStatuses[0]?.timestamps?.shippedAt && {
          shippedAt: sellerItemStatuses[0].timestamps.shippedAt,
        }),
        ...(sellerItemStatuses[0]?.timestamps?.deliveredAt && {
          deliveredAt: sellerItemStatuses[0].timestamps.deliveredAt,
        }),
        ...(sellerItemStatuses[0]?.timestamps?.receivedAt && {
          receivedAt: sellerItemStatuses[0].timestamps.receivedAt,
        }),
        ...(orderObj.timestamps?.cancelledAt && {
          cancelledAt: orderObj.timestamps.cancelledAt,
        }),
      },

      paymentInfo: {
        method: orderObj.paymentMethod === "shop_pay" ? "ShopPay" : orderObj.paymentMethod,
        ...(orderObj.paymentDetails?.transactionId && {
          transactionId: orderObj.paymentDetails.transactionId,
        }),
      },

      // ✅ REVISI: Hapus prefix "Reason:" jika sudah ada
      ...(sellerStatus === "cancelled" &&
        orderObj.notes && {
          cancelInfo: {
            reason: orderObj.notes.replace(/^Reason:\s*/i, ""), // ✅ Hapus prefix jika ada
            cancelledAt: orderObj.timestamps?.cancelledAt,
          },
        }),
      sellerInfo: {
        earnings: sellerEarnings,
        paymentStatus: paymentInfo.paymentStatus,
        canShip: sellerStatus === "packed",
        ...(customerFeedbackData && {
          customerFeedback: customerFeedbackData,
        }),
      },
    };
  }

  static async getSellerOrdersCount(sellerId, filters = {}) {
    const query = {
      "cartSnapshot.items.productSnapshot.seller._id": sellerId,
    };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }

    if (filters.productName) {
      query["cartSnapshot.items.productSnapshot.title"] = {
        $regex: filters.productName,
        $options: "i",
      };
    }

    return Order.countDocuments(query);
  }

  /**
   * Calculate seller earnings from order items with discount consideration
   */
  static calculateSellerEarnings(items, appliedCoupon = null) {
    let totalEarnings = 0;

    // Calculate subtotal first
    const subtotal = items.reduce((total, item) => {
      return total + item.priceAtPurchase * item.quantity;
    }, 0);

    // Apply discount if coupon exists
    let totalAfterDiscount = subtotal;
    if (appliedCoupon && appliedCoupon.discountAmount) {
      totalAfterDiscount = subtotal - appliedCoupon.discountAmount;
    }

    // Ensure non-negative earnings
    totalEarnings = Math.max(0, totalAfterDiscount);

    return totalEarnings;
  }

  /**
   * Get seller payment information for order
   */
  static async getSellerPaymentInfo(userId, orderId) {
    const [pendingTransaction, confirmedTransaction] = await Promise.all([
      WalletTransaction.findOne({
        userId: userId,
        orderId: orderId,
        type: "receive_pending",
      }),
      WalletTransaction.findOne({
        userId: userId,
        orderId: orderId,
        type: "receive_confirmed",
      }),
    ]);

    let paymentStatus = "not_paid";
    if (confirmedTransaction) {
      paymentStatus = "confirmed";
    } else if (pendingTransaction) {
      paymentStatus = "pending";
    }

    return { paymentStatus, pendingTransaction, confirmedTransaction };
  }

  /**
   * Format order response for seller - FIXED for aggregate results
   */
  static formatOrderResponse(orderObj, order, sellerEarnings, paymentInfo) {
    // Calculate original earnings (without discount)
    const originalEarnings = orderObj.cartSnapshot.items.reduce((total, item) => {
      return total + item.priceAtPurchase * item.quantity;
    }, 0);

    return {
      id: orderObj._id.toString(),
      orderNumber: orderObj.orderNumber,
      status: orderObj.status,
      paymentStatus: orderObj.paymentStatus || "paid",
      totalAmount: orderObj.totalAmount,
      totalItems: orderObj.cartSnapshot.items.length,
      createdAt: orderObj.createdAt,
      customer: {
        // FIXED: Handle both populated user object and direct user fields from aggregate
        username: orderObj.user?.username || orderObj.userInfo?.username || "Unknown",
        email: orderObj.user?.email || orderObj.userInfo?.email || "Unknown",
      },
      shippingAddress: {
        street: orderObj.shippingAddress?.street,
        city: orderObj.shippingAddress?.city,
        state: orderObj.shippingAddress?.state,
        zipCode: orderObj.shippingAddress?.zipCode,
        country: orderObj.shippingAddress?.country,
      },
      items: orderObj.cartSnapshot.items.map(item => ({
        productName: item.productSnapshot?.title,
        productImage: item.productSnapshot?.image,
        quantity: item.quantity,
        price: item.productSnapshot?.price,
        subtotal: item.priceAtPurchase * item.quantity,
        ...(orderObj.cartSnapshot.appliedCoupon && {
          discountApplied: {
            couponCode: orderObj.cartSnapshot.appliedCoupon.code,
            discountAmount: orderObj.cartSnapshot.appliedCoupon.discountAmount,
          },
        }),
      })),
      timestamps: {
        orderedAt: orderObj.timestamps?.orderedAt || orderObj.createdAt,
        ...(orderObj.timestamps?.packedAt && {
          packedAt: orderObj.timestamps.packedAt,
        }),
        ...(orderObj.timestamps?.shippedAt && {
          shippedAt: orderObj.timestamps.shippedAt,
        }),
        ...(orderObj.timestamps?.deliveredAt && {
          deliveredAt: orderObj.timestamps.deliveredAt,
        }),
        ...(orderObj.timestamps?.receivedAt && {
          receivedAt: orderObj.timestamps.receivedAt,
        }),
        ...(orderObj.timestamps?.cancelledAt && {
          cancelledAt: orderObj.timestamps.cancelledAt,
        }),
      },
      paymentInfo: {
        method: orderObj.paymentMethod === "shop_pay" ? "ShopPay" : orderObj.paymentMethod,
        transactionId: orderObj.paymentDetails?.transactionId,
        paidAt: orderObj.paymentDetails?.paidAt,
      },
      ...(orderObj.notes && { notes: orderObj.notes }),
      sellerInfo: {
        earnings: originalEarnings, // Original earnings (for backward compatibility)
        calculatedEarnings: sellerEarnings, // NEW: Earnings after discount
        paymentStatus: paymentInfo.paymentStatus,
        canShip: orderObj.status === "packed", // FIXED: Use orderObj instead of order
        itemsCount: orderObj.cartSnapshot.items.length,
        ...(orderObj.cartSnapshot.appliedCoupon && {
          discountInfo: {
            code: orderObj.cartSnapshot.appliedCoupon.code,
            discountAmount: orderObj.cartSnapshot.appliedCoupon.discountAmount,
            originalEarnings: originalEarnings,
            finalEarnings: sellerEarnings,
          },
        }),
        ...(orderObj.status === "received" &&
          orderObj.customerFeedback && {
            customerFeedback: {
              rating: orderObj.customerFeedback.rating,
              review: orderObj.customerFeedback.review,
              submittedAt: orderObj.customerFeedback.submittedAt,
            },
          }),
      },
    };
  }

  static async getSellerEarnings(userId, queryParams) {
    try {
      const { period = "30d", status } = queryParams; // Tambah parameter status

      const sellerProfile = await SellerProfile.findOne({ userId });
      if (!sellerProfile) {
        throw new Error("SELLER_PROFILE_NOT_FOUND");
      }

      const wallet = await Wallet.findByUser(userId);
      const dateRange = this.calculateDateRange(period);

      const [pendingEarnings, confirmedEarnings] = await Promise.all([
        this.getPendingEarnings(userId, dateRange.startDate, status),
        this.getConfirmedEarnings(userId, dateRange.startDate, status),
      ]);

      return this.formatEarningsSummary(period, wallet, pendingEarnings, confirmedEarnings, status);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get product reviews for seller's products
   */
  static async getSellerProductReviews(userId, queryParams) {
    const { page = 1, limit = 10, productId, rating, sortBy = "createdAt", sortOrder = "desc" } = queryParams;

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      throw new Error("SELLER_PROFILE_NOT_FOUND");
    }

    // Get seller's products
    const Product = require("../../models/products.model");
    const Review = require("../../models/review.model");

    const productsQuery = {
      sellerId: sellerProfile._id,
      isActive: true,
      deletedAt: null,
    };
    const sellerProducts = await Product.find(productsQuery).select("_id title slug image");
    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return {
        reviews: [],
        products: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalReviews: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }

    // Build review query
    const reviewQuery = {
      productId: { $in: productIds },
      isActive: true,
      deletedAt: null,
    };

    if (productId) {
      reviewQuery.productId = productId;
    }

    if (rating) {
      reviewQuery.rating = Number(rating);
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [reviews, total] = await Promise.all([
      Review.find(reviewQuery)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate("userId", "username")
        .populate("productId", "title slug image"),
      Review.countDocuments(reviewQuery),
    ]);

    return {
      reviews: reviews.map(review => ({
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        customer: {
          username: review.userId.username,
        },
        product: {
          id: review.productId._id,
          title: review.productId.title,
          slug: review.productId.slug,
          image: review.productId.image,
        },
      })),
      products: sellerProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalReviews: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get review statistics for seller's products
   */
  static async getSellerReviewStats(userId, queryParams) {
    const { period = "30d" } = queryParams;

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      throw new Error("SELLER_PROFILE_NOT_FOUND");
    }

    const Product = require("../../models/products.model");
    const Review = require("../../models/review.model");

    // Get seller's products
    const sellerProducts = await Product.find({
      sellerId: sellerProfile._id,
      isActive: true,
      deletedAt: null,
    }).select("_id title rating reviews");

    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return {
        totalProducts: 0,
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: {},
      };
    }

    const dateRange = this.calculateDateRange(period);

    // Get review statistics
    const reviewStats = await Review.aggregate([
      {
        $match: {
          productId: { $in: productIds },
          isActive: true,
          deletedAt: null,
          createdAt: { $gte: dateRange.startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          ratingDistribution: { $push: "$rating" },
        },
      },
      {
        $addFields: {
          ratingBreakdown: {
            5: {
              $size: {
                $filter: {
                  input: "$ratingDistribution",
                  cond: { $eq: ["$$this", 5] },
                },
              },
            },
            4: {
              $size: {
                $filter: {
                  input: "$ratingDistribution",
                  cond: { $eq: ["$$this", 4] },
                },
              },
            },
            3: {
              $size: {
                $filter: {
                  input: "$ratingDistribution",
                  cond: { $eq: ["$$this", 3] },
                },
              },
            },
            2: {
              $size: {
                $filter: {
                  input: "$ratingDistribution",
                  cond: { $eq: ["$$this", 2] },
                },
              },
            },
            1: {
              $size: {
                $filter: {
                  input: "$ratingDistribution",
                  cond: { $eq: ["$$this", 1] },
                },
              },
            },
          },
        },
      },
    ]);

    const stats =
      reviewStats.length > 0
        ? reviewStats[0]
        : {
            totalReviews: 0,
            averageRating: 0,
            ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          };

    return {
      period,
      totalProducts: sellerProducts.length,
      totalReviews: stats.totalReviews,
      averageRating: stats.averageRating ? Math.round(stats.averageRating * 10) / 10 : 0,
      ratingDistribution: stats.ratingBreakdown,
      productBreakdown: sellerProducts.map(product => ({
        id: product._id,
        title: product.title,
        rating: product.rating,
        reviewCount: product.reviews,
      })),
    };
  }
  /**
 * Get public review statistics by store slug (for StoreProfile page)
 * @param {string} storeSlug - Store slug
 * @returns {Promise<Object>} Review statistics
 */
static async getPublicReviewStatsBySlug(storeSlug) {
  const mongoose = require("mongoose");
  
  // Get seller profile by slug
  const sellerProfile = await SellerProfile.findOne({ 
    storeSlug, 
    status: "active",
    deletedAt: null 
  });
  
  if (!sellerProfile) {
    return {
      totalReviews: 0,
      averageRating: 0
    };
  }

  const Product = require("../../models/products.model");
  const Review = require("../../models/review.model");

  // Get seller's products
  const sellerProducts = await Product.find({
    sellerId: sellerProfile._id,
    isActive: true,
    deletedAt: null,
  }).select("_id");

  const productIds = sellerProducts.map(p => p._id);

  if (productIds.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 0
    };
  }

  // Get review statistics (all time, no date filter)
  const [reviewStats] = await Review.aggregate([
    {
      $match: {
        productId: { $in: productIds },
        isActive: true,
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: "$rating" },
      },
    },
  ]);

  return {
    totalReviews: reviewStats?.totalReviews || 0,
    averageRating: reviewStats?.averageRating 
      ? Math.round(reviewStats.averageRating * 10) / 10 
      : 0
  };
}

  /**
   * Calculate date range based on period
   */
  static calculateDateRange(period) {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    return { startDate, endDate };
  }
  /**
   * Get pending earnings transactions with status filter
   */
  static async getPendingEarnings(userId, startDate, statusFilter) {
    const pipeline = [
      {
        $match: {
          userId: userId,
          type: "receive_pending",
          createdAt: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "orderInfo",
        },
      },
      {
        $unwind: "$orderInfo",
      },
      {
        $match: statusFilter ? { "orderInfo.status": statusFilter } : {},
      },
      // Filter out orders that already have confirmed transactions
      {
        $lookup: {
          from: "wallettransactions",
          let: { orderId: "$orderId", userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$orderId", "$$orderId"] },
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$type", "receive_confirmed"] },
                  ],
                },
              },
            },
          ],
          as: "confirmedTx",
        },
      },
      {
        $match: {
          confirmedTx: { $size: 0 }, // Only include if no confirmed transaction exists
        },
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          description: 1,
          createdAt: 1,
          type: 1,
          orderId: {
            _id: "$orderInfo._id",
            orderNumber: "$orderInfo.orderNumber",
            status: "$orderInfo.status",
          },
        },
      },
    ];

    return WalletTransaction.aggregate(pipeline);
  }

  /**
   * Get confirmed earnings transactions with status filter
   */
  static async getConfirmedEarnings(userId, startDate, statusFilter) {
    const pipeline = [
      {
        $match: {
          userId: userId,
          type: "receive_confirmed",
          createdAt: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "orderInfo",
        },
      },
      {
        $unwind: "$orderInfo",
      },
      {
        $match: statusFilter ? { "orderInfo.status": statusFilter } : {},
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          description: 1,
          createdAt: 1,
          type: 1,
          orderId: {
            _id: "$orderInfo._id",
            orderNumber: "$orderInfo.orderNumber",
            status: "$orderInfo.status",
          },
        },
      },
    ];

    return WalletTransaction.aggregate(pipeline);
  }

  /**
   * Format earnings summary response - Updated to handle filters
   */
  static formatEarningsSummary(period, wallet, pendingEarnings, confirmedEarnings, statusFilter = null) {
    // Ensure arrays
    const pendingArray = Array.isArray(pendingEarnings) ? pendingEarnings : [];
    const confirmedArray = Array.isArray(confirmedEarnings) ? confirmedEarnings : [];

    // Clean transaction data
    const cleanTransactions = transactions => {
      return transactions.map(tx => ({
        id: tx._id?.toString() || tx.id,
        amount: tx.amount,
        description: tx.description,
        createdAt: tx.createdAt,
        ...(tx.orderId && {
          order: {
            id: tx.orderId._id?.toString() || tx.orderId.id || tx.orderId,
            orderNumber: tx.orderId.orderNumber,
            status: tx.orderId.status,
          },
        }),
      }));
    };

    return {
      period,
      ...(statusFilter && { statusFilter }), // Include filter info if applied
      wallet: {
        available: wallet?.balance || 0,
        pending: wallet?.pendingBalance || 0,
        total: (wallet?.balance || 0) + (wallet?.pendingBalance || 0),
      },
      earnings: {
        pending: {
          amount: pendingArray.reduce((sum, t) => sum + (t?.amount || 0), 0),
          count: pendingArray.length,
          transactions: cleanTransactions(pendingArray),
        },
        confirmed: {
          amount: confirmedArray.reduce((sum, t) => sum + (t?.amount || 0), 0),
          count: confirmedArray.length,
          transactions: cleanTransactions(confirmedArray),
        },
      },
      summary: {
        totalEarnings:
          pendingArray.reduce((sum, t) => sum + (t?.amount || 0), 0) +
          confirmedArray.reduce((sum, t) => sum + (t?.amount || 0), 0),
        totalTransactions: pendingArray.length + confirmedArray.length,
        ...(statusFilter && {
          note: `Filtered by order status: ${statusFilter}`,
        }),
      },
    };
  }
}

module.exports = SellerOrderService;
