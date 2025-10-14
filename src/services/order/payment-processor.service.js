// payment-processor.service.js
const Order = require("../../models/order.model");
const Wallet = require("../../models/wallet.model");

class PaymentProcessorService {
  /**
   * Validate payment request - DENGAN DEBUG LENGKAP
   */
  static async validatePaymentRequest(orderId, userId, pin) {
    const pinValidation = this.validatePinInput(pin);
    if (!pinValidation.isValid) {
      return pinValidation;
    }

    const { order, userWallet } = await this.fetchOrderAndWallet(orderId, userId);

    const orderValidation = this.validateOrderStatus(order);
    if (!orderValidation.isValid) {
      return orderValidation;
    }

    const walletValidation = await this.validateWalletAndPinWithFetchedWallet(
      userWallet,
      pin,
      order.cartSnapshot.finalPrice
    );

    if (!walletValidation.isValid) {
      return walletValidation;
    }

    return {
      isValid: true,
      data: {
        order,
        userWallet: walletValidation.data.userWallet,
      },
    };
  }

  /**
   * Validate PIN input
   */
  static validatePinInput(pin) {
    if (!pin) {
      return {
        isValid: false,
        message: "PIN is required for ShopPay payment",
        statusCode: 400,
      };
    }
    return { isValid: true };
  }

  /**
   * Fetch order and wallet in parallel
   */
  static async fetchOrderAndWallet(orderId, userId) {
    const [order, userWallet] = await Promise.all([this.findOrderById(orderId, userId), this.findWalletByUser(userId)]);

    return { order, userWallet };
  }

  static async findOrderById(orderId, userId) {
    return await Order.findOne({
      _id: orderId,
      user: userId,
    }).select("_id user paymentStatus status cartSnapshot orderNumber"); // Hapus .lean()
  }

  /**
   * Find wallet by user - FIXED VERSION
   */
  static async findWalletByUser(userId) {
    const wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      return null;
    }

    // Ensure PIN field exists
    if (!wallet.pin) {
      console.error("⚠️ Wallet found but PIN is missing:", {
        userId,
        walletId: wallet._id,
        hasPin: !!wallet.pin,
      });
    }

    return wallet;
  }

  /**
   * Validate order status for payment
   */
  static validateOrderStatus(order) {
    if (!order) {
      return {
        isValid: false,
        message: "Order not found",
        statusCode: 404,
      };
    }

    if (order.paymentStatus !== "pending") {
      return {
        isValid: false,
        message: "Order is already processed",
        statusCode: 400,
      };
    }

    if (order.status !== "pending") {
      return {
        isValid: false,
        message: "Order cannot be paid at this stage",
        statusCode: 400,
      };
    }

    return { isValid: true };
  }

  static async validateWalletAndPinWithFetchedWallet(userWallet, pin, amount) {
    const walletExistenceValidation = this.validateWalletExistence(userWallet);
    if (!walletExistenceValidation.isValid) {
      return walletExistenceValidation;
    }

    const walletStatusValidation = this.validateWalletStatus(userWallet);
    if (!walletStatusValidation.isValid) {
      return walletStatusValidation;
    }

    const pinValidation = await this.validateWalletPin(userWallet, pin);
    if (!pinValidation.isValid) {
      return pinValidation;
    }

    // PERBAIKAN: Ganti nama method dan pastikan tidak async
    const balanceValidation = this.validateWalletSufficientBalance(userWallet, amount);
    if (!balanceValidation.isValid) {
      return balanceValidation;
    }

    return {
      isValid: true,
      data: {
        userWallet,
      },
    };
  }

  /**
   * Validate wallet balance for order - KEEP EXISTING METHOD FOR OTHER USE
   * (Rename to avoid confusion)
   */
  static async validateWalletBalanceForOrder(userId, amount) {
    const wallet = await this.findWalletByUserLean(userId);

    return this.buildWalletBalanceResult(wallet, amount);
  }
  /**
   * Validate wallet existence
   */
  static validateWalletExistence(userWallet) {
    if (!userWallet) {
      return {
        isValid: false,
        message: "ShopPay wallet not found. Please contact support.",
        statusCode: 400,
      };
    }
    return { isValid: true };
  }

  /**
   * Validate wallet status
   */
  static validateWalletStatus(userWallet) {
    if (!userWallet.isActive) {
      return {
        isValid: false,
        message: "Your ShopPay wallet is inactive. Please contact support.",
        statusCode: 400,
      };
    }
    return { isValid: true };
  }

  /**
   * Validate wallet PIN
   */
  /**
   * Validate wallet PIN - DENGAN DEBUG TAMBAHAN
   */
  static async validateWalletPin(userWallet, pin) {
    const isPinValid = await userWallet.validatePin(pin);

    if (!isPinValid) {
      return {
        isValid: false,
        message: "Invalid PIN. Please check your ShopPay PIN and try again.",
        code: "INVALID_PIN",
        statusCode: 400,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate wallet balance
   */
  // Ganti method validateWalletBalance yang untuk cek sufficient balance
  static validateWalletSufficientBalance(userWallet, amount) {
    if (!userWallet.hasSufficientBalance(amount)) {
      return {
        isValid: false,
        message: "Insufficient ShopPay balance",
        statusCode: 400,
        data: {
          currentBalance: userWallet.balance,
          requiredAmount: amount,
          shortfall: amount - userWallet.balance,
        },
      };
    }
    return { isValid: true };
  }

  /**
   * Validate wallet and PIN (original method for backward compatibility)
   */
  static async validateWalletAndPin(userId, pin, amount) {
    const userWallet = await this.findWalletByUser(userId);
    return await this.validateWalletAndPinWithFetchedWallet(userWallet, pin, amount);
  }

  /**
   * Validate wallet balance for order
   */
  static async validateWalletBalance(userId, amount) {
    const wallet = await this.findWalletByUserLean(userId);

    return this.buildWalletBalanceResult(wallet, amount);
  }

  /**
   * Find wallet by user (lean query)
   */
  static async findWalletByUserLean(userId) {
    return await Wallet.findByUser(userId).select("balance isActive").lean();
  }

  /**
   * Build wallet balance validation result
   */
  static buildWalletBalanceResult(wallet, amount) {
    const result = {
      hasWallet: !!wallet,
      isActive: wallet ? wallet.isActive : false,
      balance: wallet ? wallet.balance : 0,
      requiredAmount: amount,
      hasSufficientBalance: false,
      shortfall: amount,
    };

    if (wallet && wallet.isActive) {
      result.hasSufficientBalance = wallet.balance >= amount;
      result.shortfall = result.hasSufficientBalance ? 0 : amount - wallet.balance;
    }

    return result;
  }

  /**
   * Generate payment transaction ID
   */
  static generateTransactionId(orderNumber) {
    return `SP_${orderNumber}_${Date.now()}`;
  }

  /**
   * Process payment completion
   */
  static async completePayment(order, transactionId) {
    await this.updateOrderPaymentStatus(order._id, transactionId);

    const updatedOrder = await this.fetchUpdatedOrder(order._id);
    return updatedOrder;
  }

  /**
   * Update order payment status using bulk write
   */
  static async updateOrderPaymentStatus(orderId, transactionId) {
    const Order = require("../../models/order.model");

    const updateOperation = this.buildPaymentUpdateOperation(orderId, transactionId);

    await Order.bulkWrite([updateOperation]);
  }

  /**
   * Build payment update operation
   */
  static buildPaymentUpdateOperation(orderId, transactionId) {
    const currentTimestamp = new Date();

    return {
      updateOne: {
        filter: { _id: orderId },
        update: {
          $set: {
            paymentStatus: "paid",
            paymentDetails: {
              transactionId: transactionId,
              paymentGateway: "ShopPay",
              paidAt: currentTimestamp,
            },
            status: "packed",
            "timestamps.packedAt": currentTimestamp,
          },
        },
      },
    };
  }

  /**
   * Fetch updated order after payment
   */
  static async fetchUpdatedOrder(orderId) {
    const Order = require("../../models/order.model");
    return await Order.findById(orderId);
  }

  /**
   * Handle payment failure
   */
  static async handlePaymentFailure(order, error) {
    try {
      await this.cancelFailedOrder(order, error);
    } catch (cancelError) {
      this.logOrderCancellationError(cancelError);
    }
  }

  /**
   * Cancel order due to payment failure
   */
  static async cancelFailedOrder(order, error) {
    const cancellationReason = `Payment failed: ${error.message}`;
    await order.cancel(cancellationReason);
  }

  /**
   * Log order cancellation error
   */
  static logOrderCancellationError(cancelError) {
    console.error("Failed to cancel order after payment failure:", cancelError);
  }
}

module.exports = PaymentProcessorService;
