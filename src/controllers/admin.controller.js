// admin-wallet.controller.js
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/wallet-transaction.model');
const User = require('../models/user.model');
const asyncHandler = require('../middlewares/asyncHandler');

class AdminWalletController {
  /**
   * GET /wallets - Get all user wallets with pagination
   */
  static getAllWallets = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minBalance,
      maxBalance,
      hasPendingBalance
    } = req.query;

    const query = { isActive: true };
    
    // Filter berdasarkan balance range
    if (minBalance || maxBalance) {
      query.balance = {};
      if (minBalance) query.balance.$gte = parseFloat(minBalance);
      if (maxBalance) query.balance.$lte = parseFloat(maxBalance);
    }
    
    // Filter yang punya pending balance
    if (hasPendingBalance === 'true') {
      query.pendingBalance = { $gt: 0 };
    }

    let wallets = await Wallet.find(query)
      .populate('userId', 'username email role createdAt')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Filter berdasarkan search (username/email)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      wallets = wallets.filter(wallet => 
        wallet.userId?.username?.match(searchRegex) || 
        wallet.userId?.email?.match(searchRegex)
      );
    }

    const total = await Wallet.countDocuments(query);

    res.json({
      success: true,
      data: {
        wallets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalWallets: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  });

  /**
   * GET /wallets/:userId - Get specific user wallet details
   */
  static getUserWallet = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const wallet = await Wallet.findByUser(userId)
      .populate('userId', 'username email role createdAt');

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Get recent transactions
    const recentTransactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('orderId', 'orderNumber status')
      .populate('adminId', 'username email');

    res.json({
      success: true,
      data: {
        wallet,
        recentTransactions
      }
    });
  });

  /**
   * POST /wallets/:userId/top-up - Add balance to user wallet
   */
  static topUpBalance = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { amount, description = 'Admin top-up' } = req.body;
    const adminId = req.user.userId;

    // Validasi input
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be positive'
      });
    }

    if (amount > 10000000) { // Max 10 juta per transaksi
      return res.status(400).json({
        success: false,
        message: 'Maximum top-up amount is 10,000,000'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find or create wallet
    let wallet = await Wallet.findByUser(userId);
    if (!wallet) {
      wallet = await Wallet.createWallet(userId);
    }

    // Create transaction
    const transaction = await WalletTransaction.createTransaction({
      userId,
      type: 'top_up',
      amount: Math.abs(amount),
      description: `${description} - by Admin`,
      adminId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        source: 'admin_panel'
      }
    });

    // Reload wallet untuk mendapatkan balance terbaru
    await wallet.reload();

    res.json({
      success: true,
      message: 'Balance topped up successfully',
      data: {
        transaction,
        newBalance: wallet.balance,
        newAvailableBalance: wallet.availableBalance
      }
    });
  });

  /**
   * POST /wallets/:userId/deduct - Deduct balance from user wallet
   */
  static deductBalance = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { amount, description = 'Admin deduction', reason } = req.body;
    const adminId = req.user.userId;

    // Validasi input
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be positive'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason for deduction is required'
      });
    }

    const wallet = await Wallet.findByUser(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    if (!wallet.hasSufficientBalance(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance',
        data: {
          currentBalance: wallet.balance,
          requestedAmount: amount,
          shortfall: amount - wallet.balance
        }
      });
    }

    // Create transaction
    const transaction = await WalletTransaction.createTransaction({
      userId,
      type: 'admin_deduct',
      amount: -Math.abs(amount),
      description: `${description} - Reason: ${reason}`,
      adminId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        source: 'admin_panel',
        reason
      }
    });

    // Reload wallet
    await wallet.reload();

    res.json({
      success: true,
      message: 'Balance deducted successfully',
      data: {
        transaction,
        newBalance: wallet.balance,
        newAvailableBalance: wallet.availableBalance
      }
    });
  });

  /**
   * GET /transactions - Get all wallet transactions
   */
  static getAllTransactions = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      type,
      status,
      userId,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minAmount,
      maxAmount
    } = req.query;

    const query = {};

    if (type) query.type = type;
    if (status) query.status = status;
    if (userId) query.userId = userId;

    // Filter berdasarkan tanggal
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Filter berdasarkan amount
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    const transactions = await WalletTransaction.find(query)
      .populate('userId', 'username email')
      .populate('orderId', 'orderNumber status totalAmount')
      .populate('adminId', 'username email')
      .populate('sellerId', 'storeName')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WalletTransaction.countDocuments(query);

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
   * GET /stats - Get wallet system statistics
   */
  static getWalletStats = asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch(period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Aggregate wallet statistics
    const [
      totalWallets,
      activeWallets,
      totalBalance,
      totalPendingBalance,
      transactionStats
    ] = await Promise.all([
      // Total wallets
      Wallet.countDocuments({}),
      
      // Active wallets (have transactions in period)
      Wallet.countDocuments({
        lastTransaction: { $gte: startDate }
      }),
      
      // Total balance across all wallets
      Wallet.aggregate([
        { $group: { _id: null, total: { $sum: '$balance' } } }
      ]),
      
      // Total pending balance
      Wallet.aggregate([
        { $group: { _id: null, total: { $sum: '$pendingBalance' } } }
      ]),
      
      // Transaction statistics
      WalletTransaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        }
      ])
    ]);

    const stats = {
      period,
      dateRange: {
        from: startDate,
        to: endDate
      },
      wallets: {
        total: totalWallets,
        active: activeWallets,
        totalBalance: totalBalance[0]?.total || 0,
        totalPendingBalance: totalPendingBalance[0]?.total || 0
      },
      transactions: {
        byType: {},
        summary: {
          totalTransactions: 0,
          totalVolume: 0,
          avgTransactionAmount: 0
        }
      }
    };

    // Process transaction stats
    transactionStats.forEach(stat => {
      stats.transactions.byType[stat._id] = {
        count: stat.count,
        totalAmount: stat.totalAmount,
        avgAmount: Math.round(stat.avgAmount)
      };
      
      stats.transactions.summary.totalTransactions += stat.count;
      stats.transactions.summary.totalVolume += Math.abs(stat.totalAmount);
    });
    
    if (stats.transactions.summary.totalTransactions > 0) {
      stats.transactions.summary.avgTransactionAmount = Math.round(
        stats.transactions.summary.totalVolume / stats.transactions.summary.totalTransactions
      );
    }

    res.json({
      success: true,
      data: stats
    });
  });

  /**
   * POST /transactions/:transactionId/reverse - Reverse a transaction
   */
  static reverseTransaction = asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const { reason = 'Admin reversal', confirmReverse = false } = req.body;
    const adminId = req.user.userId;

    if (!confirmReverse) {
      return res.status(400).json({
        success: false,
        message: 'Please confirm transaction reversal by setting confirmReverse to true'
      });
    }

    const transaction = await WalletTransaction.findById(transactionId)
      .populate('userId', 'username email')
      .populate('orderId', 'orderNumber status');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    try {
      const reversalTransaction = await transaction.reverse(reason, adminId);

      res.json({
        success: true,
        message: 'Transaction reversed successfully',
        data: {
          originalTransaction: transaction,
          reversalTransaction
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * POST /wallets/:userId/activate - Activate wallet
   */
  static activateWallet = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const wallet = await Wallet.findByUser(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    wallet.isActive = true;
    await wallet.save();

    res.json({
      success: true,
      message: 'Wallet activated successfully',
      data: wallet
    });
  });

  /**
   * POST /wallets/:userId/deactivate - Deactivate wallet
   */
  static deactivateWallet = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason for deactivation is required'
      });
    }

    const wallet = await Wallet.findByUser(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    wallet.isActive = false;
    await wallet.save();

    // Log deactivation
    await WalletTransaction.create({
      userId,
      type: 'admin_deduct',
      amount: 0,
      description: `Wallet deactivated - Reason: ${reason}`,
      adminId: req.user.userId,
      balanceAfter: wallet.balance,
      pendingBalanceAfter: wallet.pendingBalance,
      metadata: {
        action: 'deactivate_wallet',
        reason
      }
    });

    res.json({
      success: true,
      message: 'Wallet deactivated successfully',
      data: wallet
    });
  });
}

module.exports = AdminWalletController;