// wallet.service.js
const Wallet = require("../models/wallet.model");
const WalletTransaction = require("../models/wallet-transaction.model");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

class WalletService {
  /**
   * Get user wallet balance
   */
  static async getBalance(userId) {
    let wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      wallet = await Wallet.createWallet(userId);
    }

    return {
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      availableBalance: wallet.availableBalance,
      totalBalance: wallet.totalBalance,
      lastTransaction: wallet.lastTransaction,
      isActive: wallet.isActive,
      pinStatus: {
        // TAMBAH INI
        isSet: !!(wallet.pin && wallet.pin.length > 0),
        needsVerification: false,
      },
    };
  }

  /**
   * Get user transaction history
   */
  static async getTransactions(userId, queryParams) {
    const {
      page = 1,
      limit = 20,
      type,
      status = "completed",
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = queryParams;

    const transactions = await WalletTransaction.getUserTransactions(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      status,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder: sortOrder === "desc" ? -1 : 1,
    });

    const total = await WalletTransaction.countDocuments({
      userId,
      ...(type && { type }),
      ...(status && { status }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { $gte: new Date(dateFrom) }),
          ...(dateTo && { $lte: new Date(dateTo) }),
        },
      }),
    });

    // Transform transactions data to match expected format
    const transformedTransactions = transactions.map(transaction => ({
      id: transaction._id || transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      order: transaction.order
        ? {
            id: transaction.order._id || transaction.order.id,
            orderNumber: transaction.order.orderNumber,
            status: transaction.order.status,
          }
        : undefined,
      balanceAfter: transaction.balanceAfter,
      pendingBalanceAfter: transaction.pendingBalanceAfter,
      status: transaction.status,
      createdAt: transaction.createdAt,
      metadata: {
        isReversed: transaction.metadata?.isReversed || false,
        hasReversal: transaction.metadata?.hasReversal || false,
      },
    }));

    return {
      transactions: transformedTransactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalTransactions: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get transaction statistics
   */
  static async getStats(userId, period = "30d") {
    const stats = await WalletTransaction.getTransactionStats(userId, period);

    // Format stats untuk response
    const formattedStats = {
      period,
      summary: {
        totalIncome: 0,
        totalExpense: 0,
        totalTransactions: 0,
        netAmount: 0,
      },
      byType: {},
    };

    stats.forEach(stat => {
      formattedStats.byType[stat._id] = {
        totalAmount: stat.totalAmount,
        count: stat.count,
        avgAmount: Math.round(stat.avgAmount),
      };

      formattedStats.summary.totalTransactions += stat.count;

      if (stat.totalAmount > 0) {
        formattedStats.summary.totalIncome += stat.totalAmount;
      } else {
        formattedStats.summary.totalExpense += Math.abs(stat.totalAmount);
      }
    });

    formattedStats.summary.netAmount = formattedStats.summary.totalIncome - formattedStats.summary.totalExpense;

    return formattedStats;
  }

  /**
   * Check if user has sufficient balance
   */
  static async checkBalance(userId, amount) {
    const amountNum = parseFloat(amount);

    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Invalid amount");
    }

    const wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      return {
        hasSufficientBalance: false,
        currentBalance: 0,
        requiredAmount: amountNum,
        shortfall: amountNum,
      };
    }

    const hasSufficient = wallet.hasSufficientBalance(amountNum);

    return {
      hasSufficientBalance: hasSufficient,
      currentBalance: wallet.balance,
      requiredAmount: amountNum,
      shortfall: hasSufficient ? 0 : amountNum - wallet.balance,
    };
  }

  /**
   * Validate if payment can be processed
   */
  static async validatePayment(userId, amount, orderId) {
    if (!amount || amount <= 0) {
      throw new Error("Invalid payment amount");
    }

    const wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      return {
        canProceed: false,
        reason: "no_wallet",
      };
    }

    if (!wallet.isActive) {
      return {
        canProceed: false,
        reason: "wallet_inactive",
      };
    }

    if (!wallet.hasSufficientBalance(amount)) {
      return {
        canProceed: false,
        reason: "insufficient_balance",
        currentBalance: wallet.balance,
        requiredAmount: amount,
        shortfall: amount - wallet.balance,
      };
    }

    return {
      canProceed: true,
      currentBalance: wallet.balance,
      remainingBalance: wallet.balance - amount,
    };
  }

  static async setPin(userId, pin, currentPin) {
    if (!pin) {
      throw new Error("PIN is required");
    }

    const pinString = String(pin);

    if (pinString.length !== 6 || !/^\d{6}$/.test(pinString)) {
      throw new Error("PIN must be exactly 6 digits");
    }

    const wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const hasPinSet = wallet.pin && wallet.pin !== null && wallet.pin.length > 0;

    if (hasPinSet) {
      if (!currentPin) {
        throw new Error("Current PIN is required to change existing PIN");
      }

      const isCurrentPinValid = await wallet.validatePin(String(currentPin));
      if (!isCurrentPinValid) {
        throw new Error("Current PIN is incorrect");
      }
    }

    // Hash PIN
    const saltRounds = 10;
    const hashedPin = await bcrypt.hash(pinString, saltRounds);

    // ✅ PERBAIKAN: Update langsung di database tanpa lewat instance
    const result = await Wallet.findByIdAndUpdate(wallet._id, { pin: hashedPin }, { new: true, runValidators: true });

    console.log("✅ PIN saved to database:", {
      walletId: result._id,
      hasPinInDB: !!result.pin,
      pinLength: result.pin ? result.pin.length : 0,
    });

    return {
      success: true,
      message: hasPinSet ? "PIN updated successfully" : "PIN created successfully",
    };
  }
  /**
   * Transfer between wallets (user to seller)
   */
  static async transfer(fromUserId, toUserId, amount, orderId, description = "Payment transfer") {
    const session = await mongoose.startSession();

    try {
      let result;
      await session.withTransaction(async () => {
        // Ambil wallet sender dan receiver
        const senderWallet = await Wallet.findByUser(fromUserId).session(session);
        const receiverWallet = await Wallet.findByUser(toUserId).session(session);

        if (!senderWallet) throw new Error("Sender wallet not found");
        if (!receiverWallet) throw new Error("Receiver wallet not found");
        if (!senderWallet.hasSufficientBalance(amount)) throw new Error("Insufficient balance");

        // TAMBAHAN: Cari SellerProfile untuk receiver
        const SellerProfile = mongoose.model("SellerProfile");
        const sellerProfile = await SellerProfile.findOne({
          userId: toUserId,
        }).session(session);

        // Deduct dari sender
        senderWallet.balance -= amount;
        senderWallet.availableBalance = senderWallet.balance;
        senderWallet.lastTransaction = new Date();

        // Add ke pending balance receiver (karena order belum selesai)
        receiverWallet.pendingBalance += amount;
        receiverWallet.lastTransaction = new Date();

        await senderWallet.save({ session });
        await receiverWallet.save({ session });

        // Create transaction records
        const WalletTransaction = mongoose.model("WalletTransaction");

        await WalletTransaction.create(
          [
            {
              userId: fromUserId,
              type: "payment",
              amount: -amount,
              description,
              orderId,
              balanceAfter: senderWallet.balance,
              pendingBalanceAfter: senderWallet.pendingBalance,
            },
            {
              userId: toUserId,
              type: "receive_pending",
              amount: amount,
              description: `Pending ${description}`,
              orderId,
              sellerId: sellerProfile ? sellerProfile._id : null, // PERBAIKAN: Isi sellerId
              balanceAfter: receiverWallet.balance,
              pendingBalanceAfter: receiverWallet.pendingBalance,
            },
          ],
          { session, ordered: true }
        );

        result = { senderWallet, receiverWallet };
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Process payment to seller (used in order processing)
   */
  static async processPaymentToSeller(buyerId, sellerId, amount, orderId, description) {
    if (amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    const buyerWallet = await Wallet.findByUser(buyerId);
    if (!buyerWallet) {
      throw new Error("BUYER_WALLET_NOT_FOUND");
    }

    if (!buyerWallet.hasSufficientBalance(amount)) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    let sellerWallet = await Wallet.findByUser(sellerId);
    if (!sellerWallet) {
      sellerWallet = await Wallet.createWallet(sellerId);
    }

    // Use the transfer method from the existing service
    const result = await this.transfer(buyerId, sellerId, amount, orderId, description);

    return result;
  }

  /**
   * Confirm pending balance for seller (when order is delivered)
   */
  static async confirmSellerPendingBalance(sellerId, amount, orderId, description) {
    if (amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    const wallet = await Wallet.findByUser(sellerId);
    if (!wallet) {
      throw new Error("SELLER_WALLET_NOT_FOUND");
    }

    if (wallet.pendingBalance < amount) {
      throw new Error("INSUFFICIENT_PENDING_BALANCE");
    }

    await wallet.confirmPendingBalance(amount, description);

    const transaction = await WalletTransaction.createTransaction({
      userId: sellerId,
      type: "receive_confirmed",
      amount,
      description,
      orderId,
      metadata: {
        source: "order_delivery",
        confirmedAt: new Date(),
      },
    });

    return {
      wallet,
      transaction,
      newBalance: wallet.balance,
      newPendingBalance: wallet.pendingBalance,
    };
  }

  /**
   * Cancel pending balance (when order is cancelled/refunded)
   */
  static async cancelPendingBalance(sellerId, amount, orderId, reason) {
    if (amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    const wallet = await Wallet.findByUser(sellerId);
    if (!wallet) {
      throw new Error("SELLER_WALLET_NOT_FOUND");
    }

    if (wallet.pendingBalance < amount) {
      throw new Error("INSUFFICIENT_PENDING_BALANCE");
    }

    await wallet.cancelPendingBalance(amount, reason);

    // Create cancellation record
    const transaction = await WalletTransaction.create({
      userId: sellerId,
      type: "refund",
      amount: -amount, // Negative as it's being removed
      description: `Cancelled pending payment - ${reason}`,
      orderId,
      balanceAfter: wallet.balance,
      pendingBalanceAfter: wallet.pendingBalance,
      metadata: {
        source: "order_cancellation",
        reason: reason,
      },
    });

    return {
      wallet,
      transaction,
      newPendingBalance: wallet.pendingBalance,
    };
  }

  /**
   * Validate PIN for security operations
   */
  static async validatePin(userId, pin) {
    if (!pin) {
      throw new Error("PIN_REQUIRED");
    }

    const wallet = await Wallet.findByUser(userId);
    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    if (!wallet.pin) {
      throw new Error("PIN_NOT_SET");
    }

    const isValid = await wallet.validatePin(String(pin));

    return {
      isValid,
      wallet,
    };
  }

  /**
   * Get detailed wallet information with security checks
   */
  static async getWalletDetails(userId, includeTransactions = false, transactionLimit = 10) {
    const wallet = await Wallet.findByUser(userId);

    if (!wallet) {
      // Create wallet if doesn't exist
      const newWallet = await Wallet.createWallet(userId);
      return {
        ...newWallet.toUserResponse(),
        recentTransactions: [],
      };
    }

    const walletData = wallet.toUserResponse();

    if (includeTransactions) {
      const recentTransactions = await WalletTransaction.find({
        userId,
        status: "completed",
      })
        .sort({ createdAt: -1 })
        .limit(transactionLimit)
        .populate("orderId", "orderNumber status")
        .lean();

      walletData.recentTransactions = recentTransactions;
    }

    return walletData;
  }

  /**
   * Error handling helper for wallet operations
   */
  static getErrorDetails(errorMessage) {
    const errorMap = {
      INVALID_AMOUNT: { code: 400, message: "Invalid amount provided" },
      WALLET_NOT_FOUND: { code: 404, message: "Wallet not found" },
      SELLER_WALLET_NOT_FOUND: {
        code: 404,
        message: "Seller wallet not found",
      },
      BUYER_WALLET_NOT_FOUND: { code: 404, message: "Buyer wallet not found" },
      INSUFFICIENT_BALANCE: { code: 400, message: "Insufficient balance" },
      INSUFFICIENT_PENDING_BALANCE: {
        code: 400,
        message: "Insufficient pending balance",
      },
      PIN_REQUIRED: { code: 400, message: "PIN is required" },
      PIN_NOT_SET: { code: 400, message: "PIN has not been set" },
      INVALID_PIN: { code: 400, message: "Invalid PIN provided" },
    };

    return errorMap[errorMessage] || { code: 500, message: "Internal server error" };
  }
}

module.exports = WalletService;
