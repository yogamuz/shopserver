
// ============================================================
// FILE 1: services/order/order-payment.service.js (NEW)
// ============================================================
const Order = require("../../models/order.model");
const Cart = require("../../models/cart.model");
const Wallet = require("../../models/wallet.model");
const WalletTransaction = require("../../models/wallet-transaction.model");
const PaymentProcessorService = require("./payment-processor.service");
const InventoryService = require("./inventory.service");
const SellerTransactionService = require("./seller-transaction.service");
const logger = require("../../utils/logger");

class OrderPaymentService {
  /**
   * Pay for order with ShopPay
   */
  static async payOrder(orderId, userId, pin) {
    const validationResult = await PaymentProcessorService.validatePaymentRequest(orderId, userId, pin);

    if (!validationResult.isValid) {
      const error = new Error(validationResult.message);
      error.statusCode = validationResult.statusCode || 400;
      if (validationResult.code) error.code = validationResult.code;
      if (validationResult.data) error.data = validationResult.data;
      throw error;
    }

    const { order, userWallet } = validationResult.data;

    // Revalidate stock before payment
    const stockRevalidation = await InventoryService.validateStockForOrder(
      order.cartSnapshot.items.map(item => ({
        product: {
          _id: item.product,
          title: item.productSnapshot?.title || "Unknown Product",
        },
        quantity: item.quantity,
      }))
    );

    if (!stockRevalidation.isValid) {
      const error = new Error("Stock validation failed before payment");
      error.statusCode = 400;
      error.data = stockRevalidation.issues;
      throw error;
    }

    try {
      const totalAmount = order.cartSnapshot.finalPrice;
      await userWallet.deductBalance(totalAmount, `Payment for order ${order.orderNumber}`);

      // Process seller payments
      await SellerTransactionService.processSellerPayments(order, userId);

      const transactionId = `SP_${order.orderNumber}_${Date.now()}`;
      await order.markAsPaid({
        transactionId: transactionId,
        paymentGateway: "ShopPay",
      });

      // Initialize item statuses
      if (!order.itemStatuses || order.itemStatuses.length === 0) {
        order.itemStatuses = order.cartSnapshot.items.map(item => ({
          product: item.product,
          sellerId: item.productSnapshot.seller._id,
          status: "packed",
          timestamps: {
            packedAt: new Date(),
          },
        }));
      }

      await order.save();
      await InventoryService.updateProductStock(order.cartSnapshot.items, -1);
      await this.clearUserCart(userId);

      await order.populate("user", "username email");
      const updatedWallet = await Wallet.findByUser(userId);

      return {
        success: true,
        message: "Payment processed successfully",
        data: {
          order: this.formatOrderData(order),
          paymentInfo: {
            method: "ShopPay",
            amount: order.totalAmount,
            status: "paid",
            transactionId: transactionId,
            remainingBalance: updatedWallet.balance,
          },
        },
      };
    } catch (error) {
      await order.cancel("Payment failed: " + error.message);
      throw error;
    }
  }

  /**
   * Validate payment before paying order
   */
  static async validatePayment(userId, orderId) {
    const order = await Order.findOne({ _id: orderId, user: userId });

    if (!order) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    if (order.paymentStatus !== "pending") {
      return {
        success: true,
        message: "Payment validation completed",
        data: {
          canPay: false,
          reason: "already_processed",
          details: {
            message: "Order is already processed",
            currentBalance: 0,
            requiredAmount: order.totalAmount,
            shortfall: 0,
          },
        },
      };
    }

    const wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      return {
        success: true,
        message: "Payment validation completed",
        data: {
          canPay: false,
          reason: "no_wallet",
          details: {
            message: "ShopPay wallet not found. Please contact support.",
            currentBalance: 0,
            requiredAmount: order.totalAmount,
            shortfall: order.totalAmount,
          },
        },
      };
    }

    if (!wallet.isActive) {
      return {
        success: true,
        message: "Payment validation completed",
        data: {
          canPay: false,
          reason: "wallet_inactive",
          details: {
            message: "Your ShopPay wallet is inactive. Please contact support.",
            currentBalance: wallet.balance,
            requiredAmount: order.totalAmount,
            shortfall: order.totalAmount - wallet.balance,
          },
        },
      };
    }

    const canPay = wallet.hasSufficientBalance(order.totalAmount);

    return {
      success: true,
      message: "Payment validation completed",
      data: {
        canPay,
        reason: canPay ? "sufficient_balance" : "insufficient_balance",
        details: {
          message: canPay ? "Payment can be processed" : "Insufficient ShopPay balance",
          currentBalance: wallet.balance,
          requiredAmount: order.cartSnapshot.finalPrice,
          shortfall: canPay ? 0 : order.cartSnapshot.finalPrice - wallet.balance,
        },
      },
    };
  }

  static formatOrderData(order) {
    return {
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.cartSnapshot.finalPrice,
      paidAt: order.paymentDetails?.paidAt,
      items: order.cartSnapshot.items.map(item => ({
        productId: item.product,
        productName: item.productSnapshot.title,
        quantity: item.quantity,
        price: item.priceAtPurchase,
        subtotal: item.priceAtPurchase * item.quantity,
      })),
      ...(order.cartSnapshot.appliedCoupon && {
        couponApplied: {
          code: order.cartSnapshot.appliedCoupon.code,
          discountAmount: order.cartSnapshot.appliedCoupon.discountAmount,
        },
      }),
    };
  }

  static async clearUserCart(userId) {
    const cart = await Cart.findByUser(userId);
    if (cart) {
      cart.items = [];
      cart.appliedCoupon = undefined;
      await cart.save();
    }
  }

  static async clearUserCartWithCoupon(userId) {
    const cart = await Cart.findByUser(userId);
    if (cart) {
      const removedCouponId = cart.appliedCoupon?.couponId;
      cart.items = [];
      cart.appliedCoupon = undefined;
      await cart.save();

      if (removedCouponId) {
        try {
          const Coupon = require("../../models/coupon.model");
          const coupon = await Coupon.findById(removedCouponId);
          if (coupon && coupon.usedCount > 0) {
            coupon.usedCount -= 1;
            await coupon.save();
          }
        } catch (couponError) {
          logger.error("Could not decrement coupon usage:", couponError);
        }
      }
    }
  }
}

module.exports = OrderPaymentService;