// wallet.controller.js
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/wallet-transaction.model');
const asyncHandler = require('../middlewares/asyncHandler');

class WalletController {
  /**
   * GET /balance - Get user wallet balance
   */
  static getBalance = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    
    let wallet = await Wallet.findByUser(userId);
    
    // Create wallet jika belum ada
    if (!wallet) {
      wallet = await Wallet.createWallet(userId);
    }
    
    res.json({
      success: true,
      data: {
        balance: wallet.balance,
        pendingBalance: wallet.pendingBalance,
        availableBalance: wallet.availableBalance,
        totalBalance: wallet.totalBalance,
        lastTransaction: wallet.lastTransaction,
        isActive: wallet.isActive
      }
    });
  });

  /**
   * GET /transactions - Get user transaction history
   */
  static getTransactions = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 20,
      type,
      status = 'completed',
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const transactions = await WalletTransaction.getUserTransactions(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      status,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder: sortOrder === 'desc' ? -1 : 1
    });

    const total = await WalletTransaction.countDocuments({
      userId,
      ...(type && { type }),
      ...(status && { status }),
      ...(dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { $gte: new Date(dateFrom) }),
          ...(dateTo && { $lte: new Date(dateTo) })
        }
      }
    });

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  });

  /**
   * GET /stats - Get transaction statistics
   */
  static getStats = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { period = '30d' } = req.query;

    const stats = await WalletTransaction.getTransactionStats(userId, period);
    
    // Format stats untuk response
    const formattedStats = {
      period,
      summary: {
        totalIncome: 0,
        totalExpense: 0,
        totalTransactions: 0,
        netAmount: 0
      },
      byType: {}
    };

    stats.forEach(stat => {
      formattedStats.byType[stat._id] = {
        totalAmount: stat.totalAmount,
        count: stat.count,
        avgAmount: Math.round(stat.avgAmount)
      };
      
      formattedStats.summary.totalTransactions += stat.count;
      
      if (stat.totalAmount > 0) {
        formattedStats.summary.totalIncome += stat.totalAmount;
      } else {
        formattedStats.summary.totalExpense += Math.abs(stat.totalAmount);
      }
    });
    
    formattedStats.summary.netAmount = formattedStats.summary.totalIncome - formattedStats.summary.totalExpense;

    res.json({
      success: true,
      data: formattedStats
    });
  });

  /**
   * GET /check-balance/:amount - Check if user has sufficient balance
   */
  static checkBalance = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { amount } = req.params;
    
    const amountNum = parseFloat(amount);
    
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    const wallet = await Wallet.findByUser(userId);
    
    if (!wallet) {
      return res.json({
        success: true,
        data: {
          hasSufficientBalance: false,
          currentBalance: 0,
          requiredAmount: amountNum,
          shortfall: amountNum
        }
      });
    }
    
    const hasSufficient = wallet.hasSufficientBalance(amountNum);
    
    res.json({
      success: true,
      data: {
        hasSufficientBalance: hasSufficient,
        currentBalance: wallet.balance,
        requiredAmount: amountNum,
        shortfall: hasSufficient ? 0 : amountNum - wallet.balance
      }
    });
  });

  /**
   * POST /validate-payment - Validate if payment can be processed
   */
  static validatePayment = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { amount, orderId } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }
    
    const wallet = await Wallet.findByUser(userId);
    
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found. Please contact support.',
        data: {
          canProceed: false,
          reason: 'no_wallet'
        }
      });
    }
    
    if (!wallet.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Your wallet is currently inactive. Please contact support.',
        data: {
          canProceed: false,
          reason: 'wallet_inactive'
        }
      });
    }
    
    if (!wallet.hasSufficientBalance(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for this payment',
        data: {
          canProceed: false,
          reason: 'insufficient_balance',
          currentBalance: wallet.balance,
          requiredAmount: amount,
          shortfall: amount - wallet.balance
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Payment can be processed',
      data: {
        canProceed: true,
        currentBalance: wallet.balance,
        remainingBalance: wallet.balance - amount
      }
    });
  });

  /**
   * GET /pending-earnings - Get seller pending earnings (for sellers)
   */
  static getPendingEarnings = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    
    // Check if user is seller
    const SellerProfile = require('../models/seller-profile.model');
    const sellerProfile = await SellerProfile.findOne({ userId });
    
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: 'Only sellers can access pending earnings'
      });
    }
    
    const wallet = await Wallet.findByUser(userId);
    
    if (!wallet) {
      return res.json({
        success: true,
        data: {
          pendingBalance: 0,
          availableBalance: 0,
          totalPendingOrders: 0,
          pendingTransactions: []
        }
      });
    }
    
    // Get pending transactions related to this seller
    const pendingTransactions = await WalletTransaction.find({
      userId,
      type: 'receive_pending',
      status: 'completed'
    })
    .populate('orderId', 'orderNumber status totalAmount')
    .sort({ createdAt: -1 })
    .limit(50);
    
    res.json({
      success: true,
      data: {
        pendingBalance: wallet.pendingBalance,
        availableBalance: wallet.balance,
        totalBalance: wallet.totalBalance,
        totalPendingOrders: pendingTransactions.length,
        pendingTransactions
      }
    });
  });

  /**
   * POST /set-pin - Set wallet PIN (optional security feature)
   */
  static setPin = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { pin, currentPin } = req.body;
    
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be 6 digits'
      });
    }
    
    const wallet = await Wallet.findByUser(userId);
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }
    
    // If wallet already has PIN, verify current PIN
    if (wallet.pin && wallet.pin !== currentPin) {
      return res.status(400).json({
        success: false,
        message: 'Current PIN is incorrect'
      });
    }
    
    wallet.pin = pin;
    await wallet.save();
    
    res.json({
      success: true,
      message: 'Wallet PIN has been set successfully'
    });
  });
}

module.exports = WalletController;