// seller-transaction.service.js
const Wallet = require("../../models/wallet.model");
const WalletTransaction = require("../../models/wallet-transaction.model");
const SellerProfile = require("../../models/seller-profile.model");
const logger = require("../../utils/logger"); // ✅ ADD THIS
class SellerTransactionService {
  /**
   * Create timeout promise that rejects after specified milliseconds
   */
  static createTimeoutPromise(ms, operation) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout: ${operation} took longer than ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Execute operation with timeout
   */
  static async withTimeout(promise, timeoutMs, operationName) {
    const timeoutPromise = this.createTimeoutPromise(timeoutMs, operationName);
    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Process seller payments when order is paid
   */
  static async processSellerPayments(order, buyerUserId) {
    try {
      const TIMEOUT_MS = 15 * 1000; // 15 seconds timeout

      const paymentOperation = async () => {
        const sellerPayments = await this.calculateSellerPayments(order);

        if (sellerPayments.size === 0) return;

        // Get all unique seller user IDs
        const sellerUserIds = Array.from(sellerPayments.values()).map(p => p.sellerUserId);

        // Batch query for existing wallets
        const existingWallets = await Wallet.find({
          userId: { $in: sellerUserIds },
        }).lean();

        const walletMap = new Map();
        existingWallets.forEach(wallet => {
          walletMap.set(wallet.userId.toString(), wallet);
        });

        // Find sellers without wallets and create them in bulk
        const missingWalletUserIds = sellerUserIds.filter(
          userId => userId.toString() !== buyerUserId.toString() && !walletMap.has(userId.toString())
        );

        if (missingWalletUserIds.length > 0) {
          await Promise.all(missingWalletUserIds.map(userId => Wallet.createWallet(userId)));
        }

        // Process transfers with individual timeout protection
        const paymentPromises = [];
        for (const [sellerId, paymentData] of sellerPayments) {
          const { amount, sellerUserId } = paymentData;

          // Skip self-transfers
          if (sellerUserId.toString() === buyerUserId.toString()) {
            console.warn(`Skipping self-transfer for user ${buyerUserId}`);
            continue;
          }

          // Wrap each transfer with timeout protection
          const transferPromise = this.withTimeout(
            Wallet.transfer(
              buyerUserId,
              sellerUserId,
              amount,
              order._id,
              `Payment for order ${order.orderNumber}${order.cartSnapshot.appliedCoupon ? " (discounted)" : ""}`
            ),
            TIMEOUT_MS,
            `transfer to seller ${sellerUserId}`
          );

          paymentPromises.push(transferPromise);
        }

        await Promise.all(paymentPromises);
      };

      // Execute the entire payment operation with timeout
      await this.withTimeout(paymentOperation(), TIMEOUT_MS, "processSellerPayments");
    } catch (error) {
      console.error("Seller payment processing failed:", error.message);

      // If it's a timeout or other critical error, attempt rollback
      if (error.message.includes("timeout") || error.message.includes("Operation timeout")) {
        console.log("Attempting to rollback seller payments due to timeout...");
        await this.rollbackSellerPayments(order._id, buyerUserId);
      }

      throw error;
    }
  }

  /**
   * Rollback seller payments in case of timeout or failure
   */
  static async rollbackSellerPayments(orderId, buyerUserId) {
    try {
      const ROLLBACK_TIMEOUT_MS = 10000; // 10 seconds timeout for rollback

      const rollbackOperation = async () => {
        // Find all transactions related to this order that need rollback
        const transactions = await WalletTransaction.find({
          orderId: orderId,
          type: { $in: ["send", "receive_pending"] },
          status: "completed",
          createdAt: { $gte: new Date(Date.now() - 60000) }, // Only recent transactions (last minute)
        }).lean();

        if (transactions.length === 0) {
          console.log("No transactions found to rollback");
          return;
        }

        // Group transactions by type
        const sendTransactions = transactions.filter(t => t.type === "send");
        const receiveTransactions = transactions.filter(t => t.type === "receive_pending");

        const rollbackPromises = [];

        // Rollback send transactions (refund buyer)
        for (const transaction of sendTransactions) {
          if (transaction.userId.toString() === buyerUserId.toString()) {
            rollbackPromises.push(
              this.withTimeout(
                Wallet.refundTransaction(transaction._id, `Rollback - Order ${orderId} payment timeout`),
                5000,
                `refund transaction ${transaction._id}`
              )
            );
          }
        }

        // Cancel pending receive transactions
        for (const transaction of receiveTransactions) {
          rollbackPromises.push(
            this.withTimeout(
              Wallet.cancelPendingTransaction(transaction._id, `Rollback - Order ${orderId} payment timeout`),
              5000,
              `cancel pending transaction ${transaction._id}`
            )
          );
        }

        if (rollbackPromises.length > 0) {
          await Promise.all(rollbackPromises);
          console.log(`Successfully rolled back ${rollbackPromises.length} transactions for order ${orderId}`);
        }
      };

      await this.withTimeout(rollbackOperation(), ROLLBACK_TIMEOUT_MS, "rollback seller payments");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message);
      // Log critical error for manual intervention
      console.error(`CRITICAL: Manual intervention required for order ${orderId} - rollback failed`);
    }
  }

  /**
   * Calculate seller payments with discount distribution
   */

static async calculateSellerPayments(order) {
  const sellerPayments = new Map();
  const missingSellerIds = new Set();

  const discountRatio = order.cartSnapshot.finalPrice / order.cartSnapshot.totalPrice;

  for (const item of order.cartSnapshot.items) {
    // ✅ Comprehensive validation
    if (!item.productSnapshot) {
      logger.error(`Item ${item.product} missing productSnapshot`);
      throw new Error(`Order data corrupted: item ${item.product} has no productSnapshot`);
    }

    if (!item.productSnapshot.seller) {
      logger.error(`Item ${item.product} missing seller in productSnapshot`);
      throw new Error(`Cannot process payment: Product has no seller information. Please contact support.`);
    }

    const seller = item.productSnapshot.seller;
    
    // ✅ Check if seller object is empty/null
    if (!seller._id) {
      logger.error(`Item ${item.product} has seller but missing _id:`, seller);
      throw new Error(`Invalid seller data for product. Please contact support with order ${order.orderNumber}`);
    }

    const sellerId = seller._id;
    let sellerUserId = seller.userId;

    if (!sellerUserId) {
      missingSellerIds.add(sellerId.toString());
    }

    const baseAmount = item.priceAtPurchase * item.quantity;
    const amount = baseAmount * discountRatio;

    const sellerIdStr = sellerId.toString();

    if (sellerPayments.has(sellerIdStr)) {
      const existing = sellerPayments.get(sellerIdStr);
      existing.amount += amount;
    } else {
      sellerPayments.set(sellerIdStr, {
        amount: amount,
        sellerUserId: sellerUserId,
        sellerId: sellerId,
      });
    }
  }

  // ✅ Check if we have any valid sellers
  if (sellerPayments.size === 0) {
    const errorMsg = `No valid seller payments found for order ${order.orderNumber}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Batch query for missing seller userIds
  if (missingSellerIds.size > 0) {
    const sellerProfiles = await SellerTransactionService.withTimeout(
      SellerProfile.find(
        {
          _id: { $in: Array.from(missingSellerIds) },
        },
        "userId"
      ).lean(),
      5000,
      "fetch seller profiles"
    );

    const sellerUserIdMap = new Map();
    sellerProfiles.forEach(profile => {
      sellerUserIdMap.set(profile._id.toString(), profile.userId);
    });

    // Update seller payments with fetched userIds
    for (const [sellerId, paymentData] of sellerPayments) {
      if (!paymentData.sellerUserId && sellerUserIdMap.has(sellerId)) {
        paymentData.sellerUserId = sellerUserIdMap.get(sellerId);
      } else if (!paymentData.sellerUserId) {
        logger.error(`Seller profile not found for seller ${sellerId}`);
        throw new Error(`Seller profile not found for seller ${sellerId}`);
      }
    }
  }

  // Remove sellerId from final result as it's not needed
  for (const [sellerId, paymentData] of sellerPayments) {
    delete paymentData.sellerId;
  }

  return sellerPayments;
}


/**
 * Process seller payment for specific item after user confirmation
 * This releases payment IMMEDIATELY when user confirms item received
 */
static async processSellerPaymentForItem(order, orderItem) {
  const mongoose = require("mongoose");

  try {
    const TIMEOUT_MS = 10000;

    const paymentOperation = async () => {
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const sellerId = orderItem.productSnapshot.seller._id;
          let sellerUserId = orderItem.productSnapshot.seller.userId; // ✅ USE let

          // Fetch userId if not in snapshot
          if (!sellerUserId) {
            const sellerProfile = await SellerProfile.findById(sellerId).session(session);
            if (!sellerProfile) {
              throw new Error(`Seller profile not found for ${sellerId}`);
            }
            sellerUserId = sellerProfile.userId; // ✅ Reassignment works
          }

          // Find pending transaction for this seller
          const pendingTransaction = await WalletTransaction.findOne({
            orderId: order._id,
            userId: sellerUserId,
            type: "receive_pending",
            status: "completed",
          }).session(session);

          if (!pendingTransaction) {
            logger.warn(`No pending transaction found for seller ${sellerUserId} in order ${order._id}`);
            return;
          }

          // Get seller wallet
          const sellerWallet = await Wallet.findOne({ userId: sellerUserId }).session(session);

          if (!sellerWallet) {
            throw new Error(`Wallet not found for seller ${sellerUserId}`);
          }

          // Calculate all items from this seller in the order
          const sellerTotalItems = order.cartSnapshot.items.filter(
            item => item.productSnapshot.seller._id.toString() === sellerId.toString()
          );

          // Check if ALL seller's items are now received
          const allSellerItemsReceived = sellerTotalItems.every(item => {
            const itemStatus = order.itemStatuses?.find(
              is => is.product.toString() === item.product.toString()
            );
            return itemStatus?.status === "received";
          });

          // Only release payment if ALL items from this seller are received
          if (!allSellerItemsReceived) {
            logger.info(`Skipping payment release - seller ${sellerUserId} has other items pending in order ${order._id}`);
            return;
          }

          // Calculate TOTAL amount for ALL seller's items
          const discountRatio = order.cartSnapshot.finalPrice / order.cartSnapshot.totalPrice;
          const sellerTotalAmount = sellerTotalItems.reduce((sum, item) => {
            const itemSubtotal = item.priceAtPurchase * item.quantity;
            return sum + (itemSubtotal * discountRatio);
          }, 0);

          if (sellerWallet.pendingBalance < sellerTotalAmount) {
            throw new Error(`Insufficient pending balance for seller ${sellerUserId}. Pending: ${sellerWallet.pendingBalance}, Required: ${sellerTotalAmount}`);
          }

          // Update wallet - move from pending to available
          sellerWallet.pendingBalance -= sellerTotalAmount;
          sellerWallet.balance += sellerTotalAmount;
          sellerWallet.availableBalance = sellerWallet.balance;
          sellerWallet.lastTransaction = new Date();
          await sellerWallet.save({ session });

          // Create confirmation transaction
          await WalletTransaction.create([{
            userId: sellerUserId,
            type: "receive_confirmed",
            amount: sellerTotalAmount,
            description: `Payment released - All items from order ${order.orderNumber} confirmed by customer`,
            orderId: order._id,
            sellerId: null,
            balanceAfter: sellerWallet.balance,
            pendingBalanceAfter: sellerWallet.pendingBalance,
            metadata: {
              source: "all_items_confirmation",
              originalTransactionId: pendingTransaction._id,
              confirmedAt: new Date(),
              totalItems: sellerTotalItems.length,
            },
          }], { session });

          logger.info(`Payment released for seller ${sellerUserId} - All ${sellerTotalItems.length} items confirmed in order ${order.orderNumber}`);
        });
      } finally {
        await session.endSession();
      }
    };

    await this.withTimeout(paymentOperation(), TIMEOUT_MS, "processSellerPaymentForItem");
  } catch (error) {
    logger.error("Seller payment for item failed:", error.message);

    if (error.message.includes("timeout") || error.message.includes("Operation timeout")) {
      logger.error(`CRITICAL: Payment release timeout for item in order ${order._id} - manual intervention required`);
    }

    throw error;
  }
}

  /**
   * Cancel pending transactions for cancelled orders
   */
  static async cancelPendingTransactions(orderId) {
    try {
      const TIMEOUT_MS = 15000; // 15 seconds timeout

      const cancellationOperation = async () => {
        const pendingTransactions = await WalletTransaction.find({
          orderId: orderId,
          type: "receive_pending",
          status: "completed",
        }).lean();

        if (pendingTransactions.length === 0) return;

        // Get unique user IDs and batch query wallets
        const userIds = [...new Set(pendingTransactions.map(t => t.userId))];
        const sellerWallets = await Wallet.find({ userId: { $in: userIds } });

        const walletMap = new Map();
        sellerWallets.forEach(wallet => {
          walletMap.set(wallet.userId.toString(), wallet);
        });

        // Process cancellations in parallel with individual timeouts
        const cancellationPromises = pendingTransactions
          .map(transaction => {
            const sellerWallet = walletMap.get(transaction.userId.toString());
            if (sellerWallet) {
              return this.withTimeout(
                sellerWallet.cancelPendingBalance(transaction.amount, `Order cancelled - ${orderId}`),
                5000,
                `cancel pending balance for user ${transaction.userId}`
              );
            }
          })
          .filter(Boolean);

        await Promise.all(cancellationPromises);
      };

      await this.withTimeout(cancellationOperation(), TIMEOUT_MS, "cancelPendingTransactions");
    } catch (error) {
      console.error("Cancel pending transactions failed:", error.message);

      if (error.message.includes("timeout") || error.message.includes("Operation timeout")) {
        console.error(
          `CRITICAL: Cancel pending transactions timeout for order ${orderId} - manual intervention required`
        );
      }

      throw error;
    }
  }

  // ADD after cancelPendingTransactions method (around line 250)
  /**
   * Cancel pending transactions for specific items (partial cancellation)
   */
  static async cancelPendingTransactionsForItems(orderId, productIds) {
    try {
      const TIMEOUT_MS = 15000;

      const cancellationOperation = async () => {
        const Order = require("../../models/order.model");
        const order = await Order.findById(orderId);

        if (!order) return;

        // Get sellers affected by these items
        const affectedSellers = new Set();
        for (const item of order.cartSnapshot.items) {
          if (productIds.some(id => id.equals(item.product))) {
            affectedSellers.add(item.productSnapshot.seller._id.toString());
          }
        }

        // Calculate amounts to cancel per seller
        const sellerCancelAmounts = new Map();
        for (const item of order.cartSnapshot.items) {
          if (productIds.some(id => id.equals(item.product))) {
            const sellerId = item.productSnapshot.seller._id.toString();
            const amount = item.priceAtPurchase * item.quantity;

            sellerCancelAmounts.set(sellerId, (sellerCancelAmounts.get(sellerId) || 0) + amount);
          }
        }

        // Get seller profiles to map to userIds
        const SellerProfile = require("../../models/seller-profile.model");
        const sellerProfiles = await SellerProfile.find({
          _id: { $in: Array.from(affectedSellers) },
        }).lean();

        const sellerUserIds = sellerProfiles.map(sp => sp.userId);

        // Get pending transactions for these sellers
        const pendingTransactions = await WalletTransaction.find({
          orderId: orderId,
          userId: { $in: sellerUserIds },
          type: "receive_pending",
          status: "completed",
        }).lean();

        if (pendingTransactions.length === 0) return;

        // Cancel pending amounts
        const wallets = await Wallet.find({ userId: { $in: sellerUserIds } });
        const walletMap = new Map();
        wallets.forEach(w => walletMap.set(w.userId.toString(), w));

        const cancellationPromises = [];
        for (const transaction of pendingTransactions) {
          const sellerId = sellerProfiles
            .find(sp => sp.userId.toString() === transaction.userId.toString())
            ?._id.toString();

          if (!sellerId) continue;

          const cancelAmount = sellerCancelAmounts.get(sellerId) || 0;
          if (cancelAmount === 0) continue;

          const wallet = walletMap.get(transaction.userId.toString());
          if (wallet) {
            cancellationPromises.push(
              this.withTimeout(
                wallet.cancelPendingBalance(
                  Math.min(cancelAmount, transaction.amount),
                  `Partial order cancellation - ${orderId}`
                ),
                5000,
                `cancel partial pending for user ${transaction.userId}`
              )
            );
          }
        }

        if (cancellationPromises.length > 0) {
          await Promise.all(cancellationPromises);
        }
      };

      await this.withTimeout(cancellationOperation(), TIMEOUT_MS, "cancelPendingTransactionsForItems");
    } catch (error) {
      console.error("Cancel pending transactions for items failed:", error.message);
      throw error;
    }
  }
  /**
   * Validate seller exists and is active
   */
  static async validateSeller(sellerId) {
    try {
      const TIMEOUT_MS = 5000; // 5 seconds timeout for validation

      const validationOperation = async () => {
        const seller = await SellerProfile.findById(sellerId).lean();

        if (!seller) {
          return {
            isValid: false,
            message: `Seller profile not found for ID: ${sellerId}`,
          };
        }

        if (seller.deletedAt || seller.status !== "active") {
          return {
            isValid: false,
            message: `Seller is not active: ${sellerId}`,
          };
        }

        return {
          isValid: true,
          data: {
            seller,
          },
        };
      };

      return await this.withTimeout(validationOperation(), TIMEOUT_MS, "validateSeller");
    } catch (error) {
      console.error("Seller validation failed:", error.message);

      // Return invalid on timeout
      if (error.message.includes("timeout") || error.message.includes("Operation timeout")) {
        return {
          isValid: false,
          message: `Seller validation timeout for ID: ${sellerId}`,
        };
      }

      throw error;
    }
  }
}

module.exports = SellerTransactionService;
