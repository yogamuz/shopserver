// ============================================================
// FILE 2: services/order/order-cancellation.service.js (NEW)
// ============================================================
const Order = require("../../models/order.model");
const CancelRequest = require("../../models/cancel-request.model");
const Wallet = require("../../models/wallet.model");
const WalletTransaction = require("../../models/wallet-transaction.model");
const InventoryService = require("./inventory.service");
const SellerTransactionService = require("./seller-transaction.service");
const OrderPaymentService = require("./order-payment.service");
const logger = require("../../utils/logger");

class OrderCancellationService {
  /**
   * Cancel order (handle pending and paid)
   */
  static async cancelOrder(orderId, userId, cancelData) {
    const { reason, itemsToCancel = [] } = cancelData;

    const order = await Order.findOne({ _id: orderId, user: userId });

    if (!order) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    // Determine items to cancel
    let targetItems = [];
    if (itemsToCancel.length > 0) {
      targetItems = itemsToCancel.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        reason: item.reason || reason,
      }));
    } else {
      targetItems = order.cartSnapshot.items.map(item => ({
        productId: item.product,
        quantity: item.quantity,
        reason: reason,
      }));
    }

    // Validate items
    const validationErrors = this.validateCancellationItems(order, targetItems);
    if (validationErrors.length > 0) {
      const error = new Error("Some items cannot be cancelled");
      error.statusCode = 400;
      error.data = { invalidItems: validationErrors };
      throw error;
    }

    if (order.paymentStatus === "paid") {
      return await this.handlePaidOrderItemCancellation(order, userId, targetItems, reason);
      // ✅ reason di-pass sebagai parameter ke-4
    }

    if (order.paymentStatus === "pending") {
      return await this.handlePendingOrderCancellation(order, reason);
    }
  }

  static validateCancellationItems(order, targetItems) {
    const validationErrors = [];

    for (const targetItem of targetItems) {
      const productIdStr = targetItem.productId.toString();
      const orderItem = order.cartSnapshot.items.find(i => {
        const itemProductId = i.product || i.productId || i._id;
        return itemProductId && itemProductId.toString() === productIdStr;
      });

      if (!orderItem) {
        validationErrors.push({
          productId: productIdStr,
          message: `Product ${productIdStr} not found in order`,
        });
        continue;
      }

      const actualProductId = (orderItem.product || orderItem.productId || orderItem._id).toString();
      const itemStatus = order.itemStatuses?.find(is => is.product.toString() === actualProductId);

      if (itemStatus && ["shipped", "delivered", "received"].includes(itemStatus.status)) {
        validationErrors.push({
          productId: productIdStr,
          productName: orderItem.productSnapshot?.title || "Unknown",
          status: itemStatus.status,
          message: `Cannot cancel - item already ${itemStatus.status}`,
        });
      }
    }

    return validationErrors;
  }
static async handlePendingOrderCancellation(order, reason) {
  // ✅ FIX: Clean up reason - hapus prefix "Reason: " jika ada
  let cleanReason = reason || 'Customer requested cancellation';
  
  if (cleanReason.startsWith('Reason: ')) {
    cleanReason = cleanReason.replace('Reason: ', '');
  }

  // Pass clean reason ke order.cancel()
  await order.cancel(cleanReason);

  if (order.itemStatuses && order.itemStatuses.length > 0) {
    order.itemStatuses = order.itemStatuses.map(itemStatus => ({
      ...(itemStatus.toObject ? itemStatus.toObject() : itemStatus),
      status: "cancelled",
      timestamps: {
        ...itemStatus.timestamps,
        cancelledAt: new Date(),
      },
    }));

    order.markModified("itemStatuses");
    await order.save();
  }

  await InventoryService.restoreProductStock(order.cartSnapshot.items);
  await OrderPaymentService.clearUserCartWithCoupon(order.user);

  return {
    success: true,
    message: "Order cancelled successfully. Cart has been cleared.",
    data: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      cancelType: "immediate",
      refundInfo: null,
      cartCleared: true,
    },
  };
}

  static async handlePaidOrderItemCancellation(order, userId, itemsToCancel, reason) {
    const existingRequest = await CancelRequest.findOne({
      orderId: order._id,
      status: "pending",
    });

    if (existingRequest) {
      return {
        success: true,
        message: "Cancel request already submitted and waiting for seller approval",
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          status: order.status,
          cancelType: "pending_approval",
          cancelRequest: {
            id: existingRequest._id.toString(),
            itemsCancelling: existingRequest.itemsToCancel.length,
            status: existingRequest.status,
            createdAt: existingRequest.createdAt,
          },
        },
      };
    }

    // Create new cancel request
    const cancelRequest = await CancelRequest.createItemLevelRequest(order._id, userId, itemsToCancel, reason);

    order.status = "cancellation_requested";
    order.cancelRequest = {
      id: cancelRequest._id,
      reason: cancelRequest.generalReason,
      status: cancelRequest.status,
      submittedAt: cancelRequest.createdAt,
      processedAt: null,
      itemsCancelling: cancelRequest.itemsToCancel.length,
      totalItems: order.cartSnapshot.items.length,
      isPartialCancel: cancelRequest.itemsToCancel.length < order.cartSnapshot.items.length,
    };

    // ✅ FIX: Set notes dengan include reason
    const isFullCancel = cancelRequest.itemsToCancel.length === order.cartSnapshot.items.length;
    const cancelType = isFullCancel ? "Full cancel" : "Partial cancel";
    order.notes = `${cancelType} request: ${reason || "No reason provided"}`;

    await order.save();

    return {
      success: true,
      message: isFullCancel
        ? "Full order cancel request submitted successfully"
        : "Partial order cancel request submitted successfully",
      data: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
        cancelType: "approval_required",
        cancelRequest: {
          id: cancelRequest._id.toString(),
          itemsCancelling: cancelRequest.itemsToCancel.length,
          totalItems: order.cartSnapshot.items.length,
          isPartialCancel: !isFullCancel,
          sellersRequired: cancelRequest.requiredSellers.length,
          estimatedResponseTime: "24-48 hours",
          items: cancelRequest.itemsToCancel.map(item => ({
            productId: item.productId,
            reason: item.reason,
            subtotal: item.subtotal,
          })),
        },
      },
    };
  }

static async processApprovedCancellation(order, cancelRequest) {
  try {
    const userWallet = await Wallet.findByUser(order.user);
    const isPartialCancel = cancelRequest.approvedItems.length < order.cartSnapshot.items.length;

    if (isPartialCancel) {
      // ... partial cancel logic ...
    } else {
      // FULL CANCELLATION
      const refundAmount = order.cartSnapshot.finalPrice;

      if (userWallet) {
        await userWallet.addBalance(refundAmount, `Refund for cancelled order ${order.orderNumber}`);

        await WalletTransaction.create({
          userId: order.user,
          type: "refund",
          amount: refundAmount,
          description: `Full Refund - Order ${order.orderNumber} cancelled with seller approval`,
          orderId: order._id,
          balanceAfter: userWallet.balance,
          pendingBalanceAfter: userWallet.pendingBalance,
          metadata: {
            cancelRequestId: cancelRequest._id,
            approvedBy: "sellers",
            cancelType: "full",
          },
        });
      }

      await SellerTransactionService.cancelPendingTransactions(order._id);

      order.itemStatuses = order.itemStatuses.map(itemStatus => ({
        ...(itemStatus.toObject ? itemStatus.toObject() : itemStatus),
        status: "cancelled",
        timestamps: {
          ...itemStatus.timestamps,
          cancelledAt: new Date(),
        },
      }));

      order.markModified("itemStatuses");

      order.status = "cancelled";
      order.paymentStatus = "refunded";
      
      // ✅ FIX: Set notes dengan reason dari cancel request
      const reasonFromRequest = cancelRequest.generalReason || "No reason provided";
      order.notes = `Reason: ${reasonFromRequest}`;
      
      await order.save();

      await InventoryService.restoreProductStock(order.cartSnapshot.items);

      return {
        success: true,
        message: "Order cancelled successfully with seller approval",
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          status: order.status,
          cancelType: "full_approved",
          refundInfo: {
            amount: refundAmount,
            processedAt: new Date(),
            method: "ShopPay",
          },
        },
      };
    }
  } catch (error) {
    const customError = new Error("Failed to process approved cancellation: " + error.message);
    customError.statusCode = 500;
    throw customError;
  }
}

}

module.exports = OrderCancellationService;
