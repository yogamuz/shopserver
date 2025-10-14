// ============================================================
// FILE 4: services/order/order-feedback.service.js (NEW)
// ============================================================
const Order = require("../../models/order.model");
const Review = require("../../models/review.model");
const Product = require("../../models/products.model");
const logger = require("../../utils/logger");

class OrderFeedbackService {
  /**
   * Update order feedback after delivery
   */
  static async updateOrderFeedback(orderId, userId, { rating, review, productReviews }) {
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    }).populate("user", "username email");

    if (!order) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    // Check at least one item received
    const hasReceivedItems = order.itemStatuses?.some(itemStatus => itemStatus.status === "received");

    if (!hasReceivedItems) {
      const error = new Error("You can only add feedback after receiving at least one product");
      error.statusCode = 400;
      throw error;
    }

    // Validate product reviews
    if (productReviews && Array.isArray(productReviews)) {
      const invalidItems = this.validateProductReviews(order, productReviews);
      if (invalidItems.length > 0) {
        const error = new Error("Some products cannot be reviewed yet");
        error.statusCode = 400;
        error.data = { invalidItems };
        throw error;
      }
    }

    // Initialize feedback
    if (!order.customerFeedback) {
      order.customerFeedback = {
        rating: null,
        review: null,
        submittedAt: null,
        hasProductReviews: false,
        productReviewsCount: 0,
      };
    }

    let actualCreatedReviews = [];

    // Handle product reviews array
    if (productReviews && Array.isArray(productReviews) && productReviews.length > 0) {
      actualCreatedReviews = await this.createProductReviews(userId, productReviews, order);

      order.customerFeedback = {
        rating: order.customerFeedback.rating,
        review: order.customerFeedback.review,
        submittedAt: new Date(),
        hasProductReviews: true,
        productReviewsCount: (order.customerFeedback.productReviewsCount || 0) + actualCreatedReviews.length,
      };
    } else if (rating || review) {
      // Handle legacy format - only received items
      actualCreatedReviews = await this.createLegacyReviews(userId, rating, review, order);

      order.customerFeedback = {
        rating: actualCreatedReviews.length > 0 && rating ? rating : order.customerFeedback.rating,
        review: actualCreatedReviews.length > 0 && review ? review.trim() : order.customerFeedback.review,
        submittedAt: new Date(),
        hasProductReviews: true,
        productReviewsCount: actualCreatedReviews.length,
      };
    }

    order.markModified("customerFeedback");
    await order.save();

    const response = {
      success: true,
      message: "Order feedback updated successfully",
      data: {
        feedback: order.customerFeedback,
      },
    };

    if (actualCreatedReviews.length > 0) {
      response.data.productReviews = {
        created: actualCreatedReviews.length,
        reviews: actualCreatedReviews,
      };
    }

    return response;
  }

  static validateProductReviews(order, productReviews) {
    const invalidItems = [];

    for (const productReview of productReviews) {
      const itemStatus = order.itemStatuses?.find(is => is.product.toString() === productReview.productId.toString());

      if (!itemStatus || itemStatus.status !== "received") {
        const orderItem = order.cartSnapshot.items.find(
          i => i.product.toString() === productReview.productId.toString()
        );

        invalidItems.push({
          productId: productReview.productId,
          productName: orderItem?.productSnapshot?.title || "Unknown",
          currentStatus: itemStatus?.status || "not_found",
          message: `Cannot review - product status is ${itemStatus?.status || "not found"}`,
        });
      }
    }

    return invalidItems;
  }

  static async createProductReviews(userId, productReviews, order) {
    const createdReviews = [];

    const reviewPromises = productReviews.map(async productReview => {
      const { productId, rating: productRating, comment: productComment } = productReview;

      const orderItem = order.cartSnapshot.items.find(item => item.product.toString() === productId.toString());
      if (!orderItem) {
        logger.warn(`Product ${productId} not found in order ${order._id}`);
        return null;
      }

      const hasValidRating = productRating && productRating >= 1 && productRating <= 5;
      const hasValidComment = productComment && productComment.trim().length >= 10;

      if (!hasValidRating && !hasValidComment) {
        return null;
      }

      return await Review.createOrUpdateReview(
        userId,
        productId,
        hasValidRating ? productRating : null,
        hasValidComment ? productComment.trim() : null
      );
    });

    const savedReviews = await Promise.all(reviewPromises);
    const validReviews = savedReviews.filter(r => r !== null);

    if (validReviews.length > 0) {
      const uniqueProductIds = [...new Set(validReviews.map(r => r.productId))];

      for (const productId of uniqueProductIds) {
        const stats = await Review.getProductRatingStats(productId);
        await Product.findByIdAndUpdate(productId, {
          rating: Math.round(stats.averageRating * 10) / 10,
          reviews: stats.totalReviews,
        });
      }

      createdReviews.push(
        ...validReviews.map(r => ({
          productId: r.productId.toString(),
          reviewId: r._id.toString(),
          isUpdate: !!r.updatedAt && r.updatedAt > r.createdAt,
        }))
      );
    }

    return createdReviews;
  }

  static async createLegacyReviews(userId, rating, review, order) {
    const createdReviews = [];
    const hasValidRating = rating && rating >= 1 && rating <= 5;
    const hasValidComment = review && review.trim().length >= 10;

    if (!hasValidRating && !hasValidComment) {
      return createdReviews;
    }

    const receivedItems = order.cartSnapshot.items.filter(item => {
      const itemStatus = order.itemStatuses?.find(is => is.product.toString() === item.product.toString());
      return itemStatus?.status === "received";
    });

    if (receivedItems.length === 0) {
      return createdReviews;
    }

    const reviewPromises = receivedItems.map(async item => {
      return await Review.createOrUpdateReview(
        userId,
        item.product,
        hasValidRating ? rating : null,
        hasValidComment ? review.trim() : null
      );
    });

    const savedReviews = await Promise.all(reviewPromises);
    const validReviews = savedReviews.filter(r => r !== null);

    if (validReviews.length > 0) {
      const uniqueProductIds = [...new Set(receivedItems.map(i => i.product))];

      for (const productId of uniqueProductIds) {
        const stats = await Review.getProductRatingStats(productId);
        await Product.findByIdAndUpdate(productId, {
          rating: Math.round(stats.averageRating * 10) / 10,
          reviews: stats.totalReviews,
        });
      }

      createdReviews.push(
        ...validReviews.map(r => ({
          productId: r.productId.toString(),
          reviewId: r._id.toString(),
          isUpdate: !!r.updatedAt && r.updatedAt > r.createdAt,
        }))
      );
    }

    return createdReviews;
  }

  /**
   * Update individual product review
   */
  static async updateProductReview(orderId, productId, userId, feedbackData = {}) {
    const { rating, review } = feedbackData;

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    const orderItem = order.cartSnapshot.items.find(item => item.product.toString() === productId.toString());

    if (!orderItem) {
      const error = new Error("Product not found in this order");
      error.statusCode = 404;
      throw error;
    }

    const itemStatus = order.itemStatuses?.find(is => is.product.toString() === productId.toString());

    if (!itemStatus) {
      const error = new Error("Item status not found");
      error.statusCode = 400;
      throw error;
    }

    if (itemStatus.status !== "received") {
      const error = new Error(
        `Cannot update review - product must be received first (current status: ${itemStatus.status})`
      );
      error.statusCode = 400;
      throw error;
    }

    const hasValidRating = rating && rating >= 1 && rating <= 5;
    const hasValidComment = review && review.trim().length >= 10;

    if (!hasValidRating && !hasValidComment) {
      const error = new Error("Please provide at least a rating or review");
      error.statusCode = 400;
      throw error;
    }

    try {
      const savedReview = await Review.createOrUpdateReview(
        userId,
        productId,
        hasValidRating ? rating : null,
        hasValidComment ? review.trim() : null
      );

      if (!savedReview) {
        const error = new Error("Failed to update review");
        error.statusCode = 500;
        throw error;
      }

      const stats = await Review.getProductRatingStats(productId);
      await Product.findByIdAndUpdate(productId, {
        rating: Math.round(stats.averageRating * 10) / 10,
        reviews: stats.totalReviews,
      });

      return {
        success: true,
        message: "Product review updated successfully",
        data: {
          productId: productId.toString(),
          productName: orderItem.productSnapshot.title,
          review: {
            reviewId: savedReview._id.toString(),
            rating: savedReview.rating,
            comment: savedReview.comment,
            updatedAt: savedReview.updatedAt,
            isUpdate: !!savedReview.updatedAt && savedReview.updatedAt > savedReview.createdAt,
          },
        },
      };
    } catch (error) {
      logger.error("Failed to update product review:", error);
      throw error;
    }
  }
}

module.exports = OrderFeedbackService;
