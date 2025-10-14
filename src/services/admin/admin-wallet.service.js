// admin-wallet.service.js
const Wallet = require("../../models/wallet.model");
const WalletTransaction = require("../../models/wallet-transaction.model");
const User = require("../../models/user.model");

class AdminWalletService {
  /**
   * Helper function to clean wallet response
   */
  static cleanWalletResponse(wallet) {
    const walletObj = wallet.toObject ? wallet.toObject() : wallet;

    delete walletObj._id;
    delete walletObj.__v;
    delete walletObj.pin;

    if (walletObj.userId) {
      delete walletObj.userId._id;
      delete walletObj.userId.__v;
      walletObj.user = walletObj.userId;
      delete walletObj.userId;
    }

    walletObj.id = wallet._id;

    return walletObj;
  }

  /**
   * Helper function to clean transaction response
   */
  static cleanTransactionResponse(transaction) {
    const transactionObj = transaction.toObject ? transaction.toObject() : transaction;

    delete transactionObj._id;
    delete transactionObj.__v;

    if (transactionObj.userId) {
      delete transactionObj.userId._id;
      delete transactionObj.userId.__v;
      transactionObj.user = transactionObj.userId;
      delete transactionObj.userId;
    }

    if (transactionObj.adminId) {
      delete transactionObj.adminId._id;
      delete transactionObj.adminId.__v;
      transactionObj.admin = transactionObj.adminId;
      delete transactionObj.adminId;
    }

    if (transactionObj.orderId) {
      delete transactionObj.orderId._id;
      delete transactionObj.orderId.__v;
      transactionObj.order = transactionObj.orderId;
      delete transactionObj.orderId;
    }

    if (transactionObj.sellerId) {
      delete transactionObj.sellerId._id;
      delete transactionObj.sellerId.__v;
      transactionObj.seller = transactionObj.sellerId;
      delete transactionObj.sellerId;
    }

    transactionObj.id = transaction._id;

    return transactionObj;
  }

  /**
   * Get all wallet transaction history (top-up, deduct, and reversals)
   */
  static async getTransactionHistory(queryParams) {
    const {
      page = 1,
      limit = 50,
      type,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
      minAmount,
      maxAmount,
    } = queryParams;

    const query = {};

    // Filter hanya top_up, admin_deduct, dan reversal transactions
    // Reversal diidentifikasi dari field reversalOf yang tidak null
    const allowedTypes = ["top_up", "admin_deduct"];

    if (type && allowedTypes.includes(type)) {
      query.type = type;
    } else {
      // Jika tidak ada type filter, tampilkan top_up, admin_deduct, dan reversal (reversalOf != null)
      query.$or = [{ type: "top_up" }, { type: "admin_deduct" }, { reversalOf: { $ne: null } }];
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    const transactions = await WalletTransaction.find(query)
      .populate("userId", "username email")
      .populate("adminId", "username email")
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WalletTransaction.countDocuments(query);

    return {
      transactions: transactions.map(tx => this.cleanTransactionResponse(tx)),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Top-up balance
   */
  static async topUpBalance(userId, amount, description, adminId, req) {
    try {
      if (!amount || amount <= 0) {
        throw new Error("INVALID_AMOUNT");
      }

      if (amount > 10000000) {
        throw new Error("MAXIMUM_AMOUNT_EXCEEDED");
      }

      const wallet = await Wallet.findOne({ userId }).populate("userId", "username email");
      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }

      const transaction = await WalletTransaction.createTransaction({
        userId: userId,
        type: "top_up",
        amount: Math.abs(amount),
        description: `${description} - by Admin`,
        adminId,
        metadata: {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          source: "admin_panel",
        },
      });

      return {
        transaction: this.cleanTransactionResponse(transaction),
        newBalance: transaction.balanceAfter,
      };
    } catch (error) {
      if (
        error.message.startsWith("WALLET_") ||
        error.message.startsWith("INVALID_") ||
        error.message.startsWith("MAXIMUM_")
      ) {
        throw error;
      }
      throw new Error("WALLET_OPERATION_FAILED");
    }
  }

  /**
   * Deduct balance
   */
  static async deductBalance(userId, amount, description, reason, adminId, req) {
    try {
      if (!amount || amount <= 0) {
        throw new Error("INVALID_AMOUNT");
      }

      if (!reason) {
        throw new Error("REASON_REQUIRED");
      }

      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }

      if (!wallet.hasSufficientBalance(amount)) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const transaction = await WalletTransaction.createTransaction({
        userId: userId,
        type: "admin_deduct",
        amount: Math.abs(amount),
        description: `${description} - Reason: ${reason}`,
        adminId,
        metadata: {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          source: "admin_panel",
          reason,
        },
      });

      return {
        transaction: this.cleanTransactionResponse(transaction),
        newBalance: transaction.balanceAfter,
      };
    } catch (error) {
      if (
        error.message.startsWith("WALLET_") ||
        error.message.startsWith("INVALID_") ||
        error.message.startsWith("INSUFFICIENT_") ||
        error.message.startsWith("REASON_")
      ) {
        throw error;
      }
      throw new Error("WALLET_OPERATION_FAILED");
    }
  }

  /**
   * Reverse transaction
   */
  static async reverseTransaction(transactionId, reason, adminId, confirmReverse) {
    try {
      if (!confirmReverse) {
        throw new Error("CONFIRMATION_REQUIRED");
      }

      const transaction = await WalletTransaction.findById(transactionId)
        .populate("userId", "username email")
        .populate("orderId", "orderNumber status");

      if (!transaction) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }

      const reversalTransaction = await transaction.reverse(reason, adminId);

      return {
        originalTransaction: this.cleanTransactionResponse(transaction),
        reversalTransaction: this.cleanTransactionResponse(reversalTransaction),
      };
    } catch (error) {
      if (error.message.startsWith("TRANSACTION_") || error.message.startsWith("CONFIRMATION_")) {
        throw error;
      }
      throw new Error("TRANSACTION_REVERSAL_FAILED");
    }
  }

  /**
   * Get error details helper
   */
  static getErrorDetails(errorMessage) {
    const errorMap = {
      WALLET_NOT_FOUND: { code: 404, message: "Wallet not found" },
      TRANSACTION_NOT_FOUND: { code: 404, message: "Transaction not found" },
      INVALID_AMOUNT: { code: 400, message: "Invalid amount provided" },
      INSUFFICIENT_BALANCE: { code: 400, message: "Insufficient balance" },
      REASON_REQUIRED: { code: 400, message: "Reason is required" },
      MAXIMUM_AMOUNT_EXCEEDED: { code: 400, message: "Maximum amount exceeded" },
      CONFIRMATION_REQUIRED: { code: 400, message: "Confirmation is required" },
    };

    return errorMap[errorMessage] || { code: 500, message: "Internal server error" };
  }
}

module.exports = AdminWalletService;
