// ============================================================
// FILE 3: services/order/order-delivery.service.js (NEW)
// ============================================================
const Order = require("../../models/order.model");
const Review = require("../../models/review.model");
const Product = require("../../models/products.model");
const SellerTransactionService = require("./seller-transaction.service");
const logger = require("../../utils/logger");

class OrderDeliveryService {
  /**
   * Confirm items delivery dynamically
   */
  static async confirmItemsDelivery(orderId, userId, confirmData = {}) {
    const { productIds, sellerId, rating, review } = confirmData;

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    }).populate("user", "username email");

    if (!order) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    // Determine target items
    let targetItems = [];

    if (productIds && productIds.length > 0) {
      targetItems = order.cartSnapshot.items.filter(item => productIds.includes(item.product.toString()));
    } else if (sellerId) {
      targetItems = order.cartSnapshot.items.filter(
        item => item.productSnapshot.seller._id.toString() === sellerId.toString()
      );
    } else {
      targetItems = order.cartSnapshot.items;
    }

    if (targetItems.length === 0) {
      const error = new Error("No items found to confirm");
      error.statusCode = 400;
      throw error;
    }

    // Validate items are delivered
    const invalidItems = this.validateDeliveryItems(order, targetItems);
    if (invalidItems.length > 0) {
      const error = new Error("Some items cannot be confirmed");
      error.statusCode = 400;
      error.data = { invalidItems };
      throw error;
    }

    // Update statuses
    const confirmedItems = this.updateItemStatuses(order, targetItems);

    // Handle reviews
    const reviewsCreated = await this.handleReviews(userId, confirmedItems, rating, review);

    // Release payments
    for (const item of confirmedItems) {
      await SellerTransactionService.processSellerPaymentForItem(order, item);
    }

    // Check if all received
    const allItemsReceived = order.itemStatuses.every(is => is.status === "received" || is.timestamps.receivedAt);

    if (allItemsReceived) {
      order.status = "received";
      if (!order.timestamps.receivedAt) {
        order.timestamps.receivedAt = new Date();
      }
    }

    order.markModified("itemStatuses");
    order.markModified("customerFeedback");
    await order.save();

    const confirmationType = productIds && productIds.length > 0 ? "specific_products" : sellerId ? "seller_parcel" : "all_items";

    return {
      success: true,
      message: this.buildConfirmMessage(allItemsReceived, confirmedItems.length, reviewsCreated.length),
      data: {
        confirmationType,
        itemsConfirmed: confirmedItems.length,
        items: confirmedItems.map(item => ({
          productId: item.product.toString(),
          productName: item.productSnapshot.title,
        })),
        orderStatus: order.status,
        allItemsReceived,
        paymentsReleased: confirmedItems.length,
        ...(reviewsCreated.length > 0 && {
          reviews: {
            created: reviewsCreated.length,
            appliedToProducts: reviewsCreated,
          },
        }),
      },
    };
  }

  static validateDeliveryItems(order, targetItems) {
    const invalidItems = [];
    for (const item of targetItems) {
      const itemStatus = order.itemStatuses?.find(is => is.product.toString() === item.product.toString());

      if (!itemStatus || itemStatus.status !== "delivered") {
        invalidItems.push({
          productId: item.product.toString(),
          productName: item.productSnapshot.title,
          currentStatus: itemStatus?.status || "not_found",
          message: `Cannot confirm - status is ${itemStatus?.status || "not found"}`,
        });
      }
    }
    return invalidItems;
  }

  static updateItemStatuses(order, targetItems) {
    const confirmedItems = [];
    for (const item of targetItems) {
      const itemStatus = order.itemStatuses.find(is => is.product.toString() === item.product.toString());

      if (itemStatus && !itemStatus.timestamps.receivedAt) {
        itemStatus.status = "received";
        itemStatus.timestamps.receivedAt = new Date();
        confirmedItems.push(item);
      }
    }
    return confirmedItems;
  }

  static async handleReviews(userId, confirmedItems, rating, review) {
    const reviewsCreated = [];
    const hasValidRating = rating && rating >= 1 && rating <= 5;
    const hasValidComment = review && review.trim().length >= 10;

    if (!hasValidRating && !hasValidComment) {
      return reviewsCreated;
    }

    try {
      for (const item of confirmedItems) {
        const savedReview = await Review.createOrUpdateReview(
          userId,
          item.product,
          hasValidRating ? rating : null,
          hasValidComment ? review.trim() : null
        );

        if (savedReview) {
          reviewsCreated.push({
            productId: item.product.toString(),
            productName: item.productSnapshot.title,
            reviewId: savedReview._id.toString(),
            isUpdate: !!savedReview.updatedAt && savedReview.updatedAt > savedReview.createdAt,
          });

          const stats = await Review.getProductRatingStats(item.product);
          await Product.findByIdAndUpdate(item.product, {
            rating: Math.round(stats.averageRating * 10) / 10,
            reviews: stats.totalReviews,
          });
        }
      }
    } catch (reviewError) {
      logger.error("Product review creation failed:", reviewError);
    }

    return reviewsCreated;
  }

  static buildConfirmMessage(allItemsReceived, confirmedCount, reviewCount) {
    let message = "";
    if (allItemsReceived) {
      message = "All items confirmed - order completed";
    } else {
      message = `${confirmedCount} item(s) confirmed as received`;
    }

    if (reviewCount > 0) {
      message += ` - Reviews applied to ${reviewCount} product(s)`;
    }

    return message;
  }

  /**
   * Check and cancel expired pending orders
   */
  static async checkExpiredOrders() {
    try {
      const now = new Date();

      const expiredOrders = await Order.find({
        status: "pending",
        paymentStatus: "pending",
        expiresAt: { $lt: now },
      });

      const results = [];

      for (const order of expiredOrders) {
        order.status = "cancelled";
        order.paymentStatus = "failed";
        order.timestamps.cancelledAt = new Date();

        if (order.itemStatuses && order.itemStatuses.length > 0) {
          order.itemStatuses = order.itemStatuses.map(itemStatus => {
            const itemObj = itemStatus.toObject ? itemStatus.toObject() : itemStatus;
            return {
              ...itemObj,
              status: "cancelled",
              timestamps: {
                ...itemObj.timestamps,
                cancelledAt: new Date(),
              },
            };
          });
          order.markModified("itemStatuses");
        }

        order.notes = order.notes
          ? `${order.notes}\n\nPayment expired`
          : "Payment Expired";

        await order.save();

        const InventoryService = require("../inventory.service");
        await InventoryService.restoreProductStock(order.cartSnapshot.items);

        const OrderPaymentService = require("./order-payment.service");
        await OrderPaymentService.clearUserCartWithCoupon(order.user);

        logger.info(`Order ${order.orderNumber} expired and cancelled automatically`);

        results.push({
          orderNumber: order.orderNumber,
          orderId: order._id.toString(),
          expiredAt: order.expiresAt,
          cancelledAt: order.timestamps.cancelledAt,
          itemsCancelled: order.itemStatuses.length,
        });
      }

      return {
        expiredCount: results.length,
        expiredOrders: results,
      };
    } catch (error) {
      logger.error("Error checking expired orders:", error);
      throw error;
    }
  }
}

module.exports = OrderDeliveryService;