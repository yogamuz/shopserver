// wallet-transaction.model.js
const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'top_up',           // Admin menambah saldo
      'payment',          // User bayar order
      'receive_pending',  // Seller terima pembayaran (pending)
      'receive_confirmed', // Seller terima pembayaran (confirmed)
      'refund',          // Refund ke user
      'withdrawal',      // Seller withdraw (future feature)
      'admin_deduct'     // Admin kurangi saldo
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  // Reference ke order jika transaksi terkait order
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  // Reference ke seller jika ada (untuk payment ke seller)
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SellerProfile',
    default: null
  },
  // Admin yang melakukan transaksi (untuk top_up/deduct)
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Saldo setelah transaksi untuk tracking
  balanceAfter: {
    type: Number,
    required: true
  },
  // Pending balance setelah transaksi
  pendingBalanceAfter: {
    type: Number,
    default: 0
  },
  // Status transaksi
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  // Metadata tambahan
  metadata: {
    ip: String,
    userAgent: String,
    source: String, // 'web', 'mobile', 'admin_panel'
  },
  // Untuk tracking reversal/refund
  reversalOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null
  },
  isReversed: {
    type: Boolean,
    default: false
  },
  reversedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes untuk performa
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, status: 1 });
walletTransactionSchema.index({ orderId: 1 });
walletTransactionSchema.index({ sellerId: 1, type: 1 });
walletTransactionSchema.index({ status: 1, createdAt: -1 });

// Virtual untuk format amount dengan tanda
walletTransactionSchema.virtual('formattedAmount').get(function() {
  const prefix = this.amount >= 0 ? '+' : '';
  return `${prefix}${this.amount.toLocaleString('id-ID')}`;
});

// Instance Methods
walletTransactionSchema.methods.reverse = async function(reason = 'Transaction reversed', adminId = null) {
  if (this.isReversed) {
    throw new Error('Transaction already reversed');
  }
  
  if (this.status !== 'completed') {
    throw new Error('Only completed transactions can be reversed');
  }
  
  const session = await mongoose.startSession();
  let reversalTransaction;
  
  try {
    await session.withTransaction(async () => {
      // Update wallet balance
      const Wallet = mongoose.model('Wallet');
      const wallet = await Wallet.findOne({ userId: this.userId }).session(session);
      
      if (!wallet) throw new Error('Wallet not found');
      
      // Reverse the transaction effects on wallet
      if (this.type === 'top_up') {
        wallet.balance -= Math.abs(this.amount);
      } else if (this.type === 'payment' || this.type === 'admin_deduct') {
        wallet.balance += Math.abs(this.amount);
      } else if (this.type === 'receive_pending') {
        wallet.pendingBalance -= Math.abs(this.amount);
      } else if (this.type === 'receive_confirmed') {
        wallet.balance -= Math.abs(this.amount);
        wallet.pendingBalance += Math.abs(this.amount);
      } else if (this.type === 'refund') {
        wallet.balance -= Math.abs(this.amount);
      }
      
      wallet.availableBalance = wallet.balance;
      wallet.lastTransaction = new Date();
      
      // Buat transaksi balikan
      reversalTransaction = new this.constructor({
        userId: this.userId,
        type: this.type === 'top_up' ? 'admin_deduct' : 'refund',
        amount: Math.abs(this.amount), // Selalu positif, logika ada di createTransaction
        description: `${reason} - Reversal of: ${this.description}`,
        orderId: this.orderId,
        sellerId: this.sellerId,
        adminId: adminId,
        reversalOf: this._id,
        balanceAfter: wallet.balance,
        pendingBalanceAfter: wallet.pendingBalance,
        metadata: {
          ...this.metadata,
          source: 'reversal'
        }
      });
      
      await wallet.save({ session });
      await reversalTransaction.save({ session });
      
      // Mark original transaction as reversed
      this.isReversed = true;
      this.reversedAt = new Date();
      await this.save({ session });
    });
    
    return reversalTransaction;
  } finally {
    await session.endSession();
  }
};

walletTransactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    type = null,
    status = null,
    sortBy = 'createdAt',
    sortOrder = -1,
    dateFrom = null,
    dateTo = null
  } = options;
  
  const query = { userId };
  
  if (type) query.type = type;
  if (status) query.status = status;
  
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }
  
  return this.find(query)
    .sort({ [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate({
      path: 'orderId',
      select: 'orderNumber status totalPrice',
      options: { strictPopulate: false }
    })
    .populate('sellerId', 'storeName storeSlug')
    .populate('adminId', 'username email')
    .lean();
};

walletTransactionSchema.statics.getTransactionStats = async function(userId, period = '30d') {
  const dateFrom = new Date();
  
  switch(period) {
    case '7d':
      dateFrom.setDate(dateFrom.getDate() - 7);
      break;
    case '30d':
      dateFrom.setDate(dateFrom.getDate() - 30);
      break;
    case '90d':
      dateFrom.setDate(dateFrom.getDate() - 90);
      break;
    default:
      dateFrom.setDate(dateFrom.getDate() - 30);
  }
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: dateFrom },
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
  ]);
  
  return stats;
};

// Static method untuk create transaction dengan wallet update - FIXED
walletTransactionSchema.statics.createTransaction = async function(transactionData) {
  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      const Wallet = mongoose.model('Wallet');
      const wallet = await Wallet.findOne({ userId: transactionData.userId }).session(session);
      
      if (!wallet) throw new Error('Wallet not found');
      
      // FIXED: Pisahkan logic untuk sellerId - jangan ubah userId
      let sellerId = transactionData.sellerId;
      
      // Untuk transaksi seller, cari sellerId berdasarkan userId tapi JANGAN ubah userId
      if (!sellerId && ['receive_pending', 'receive_confirmed'].includes(transactionData.type)) {
        const SellerProfile = mongoose.model('SellerProfile');
        const sellerProfile = await SellerProfile.findOne({ userId: transactionData.userId }).session(session);
        if (sellerProfile) {
          sellerId = sellerProfile._id;
        }
      }
      
      // Update wallet berdasarkan tipe transaksi
      switch(transactionData.type) {
        case 'top_up':
          wallet.balance += Math.abs(transactionData.amount);
          break;
          
        case 'payment':
          if (wallet.balance < Math.abs(transactionData.amount)) {
            throw new Error('Insufficient balance');
          }
          wallet.balance -= Math.abs(transactionData.amount);
          break;
          
        case 'admin_deduct':
          if (wallet.balance < Math.abs(transactionData.amount)) {
            throw new Error('Insufficient balance');
          }
          wallet.balance -= Math.abs(transactionData.amount);
          break;
          
        case 'receive_pending':
          wallet.pendingBalance += Math.abs(transactionData.amount);
          break;
          
        case 'receive_confirmed':
          // Don't modify wallet here - let the calling code handle wallet updates
          // This prevents double-processing when called from confirmPendingBalance
          break;
          
        case 'refund':
          wallet.balance += Math.abs(transactionData.amount);
          break;
      }
      
      wallet.availableBalance = wallet.balance;
      wallet.lastTransaction = new Date();
      
      // Save wallet only if it was modified
      if (transactionData.type !== 'receive_confirmed') {
        await wallet.save({ session });
      }
      
      // FIXED: Create transaction record dengan userId asli dan sellerId terpisah
      const transaction = new this({
        userId: transactionData.userId,        // TETAP userId asli (User._id)
        type: transactionData.type,
        amount: transactionData.amount,
        description: transactionData.description,
        orderId: transactionData.orderId || null,
        sellerId: sellerId,                    // SellerProfile._id (bukan userId)
        adminId: transactionData.adminId || null,
        status: transactionData.status || 'completed',
        metadata: transactionData.metadata || {},
        reversalOf: transactionData.reversalOf || null,
        balanceAfter: wallet.balance,
        pendingBalanceAfter: wallet.pendingBalance
      });
      
      await transaction.save({ session });
      
      return transaction;
    });
  } finally {
    await session.endSession();
  }
};

// Pre-save middleware
walletTransactionSchema.pre('save', function(next) {
  // Format description
  if (this.description) {
    this.description = this.description.trim();
  }
  
  next();
});

walletTransactionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Format tanggal untuk Indonesia
    if (ret.createdAt) {
      ret.formattedDate = ret.createdAt.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    // Safe access untuk order data
    if (ret.orderId && typeof ret.orderId === 'object') {
      ret.orderData = {
        orderNumber: ret.orderId.orderNumber || null,
        status: ret.orderId.status || null,
        totalPrice: ret.orderId.totalPrice || 0
      };
    }
    
    return ret;
  }
});

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);