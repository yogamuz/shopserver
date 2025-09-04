// wallet.model.js
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  // Saldo yang sedang pending (menunggu order completed)
  pendingBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  // Total saldo yang bisa digunakan
  availableBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Tracking untuk security
  lastTransaction: {
    type: Date,
    default: null
  },
  // PIN untuk keamanan ekstra (optional)
  pin: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
walletSchema.index({ userId: 1 }, { unique: true });
walletSchema.index({ isActive: 1 });

// Virtual untuk total balance (balance + pending)
walletSchema.virtual('totalBalance').get(function() {
  return this.balance + this.pendingBalance;
});

// Instance Methods
walletSchema.methods.addBalance = function(amount, description = 'Admin top-up') {
  if (amount <= 0) throw new Error('Amount must be positive');
  
  this.balance += amount;
  this.availableBalance = this.balance;
  this.lastTransaction = new Date();
  
  return this.save();
};

walletSchema.methods.deductBalance = function(amount, description = 'Payment') {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (this.balance < amount) throw new Error('Insufficient balance');
  
  this.balance -= amount;
  this.availableBalance = this.balance;
  this.lastTransaction = new Date();
  
  return this.save();
};

// Method untuk menambah pending balance (saat seller dapat pembayaran tapi order belum selesai)
walletSchema.methods.addPendingBalance = function(amount, description = 'Pending payment') {
  if (amount <= 0) throw new Error('Amount must be positive');
  
  this.pendingBalance += amount;
  this.lastTransaction = new Date();
  
  return this.save();
};

// Method untuk mengkonversi pending balance ke available balance (saat order completed)
walletSchema.methods.confirmPendingBalance = function(amount, description = 'Order completed') {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (this.pendingBalance < amount) throw new Error('Insufficient pending balance');
  
  this.pendingBalance -= amount;
  this.balance += amount;
  this.availableBalance = this.balance;
  this.lastTransaction = new Date();
  
  return this.save();
};

// Method untuk cancel pending balance (jika order dibatalkan/refund)
walletSchema.methods.cancelPendingBalance = function(amount, description = 'Order cancelled') {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (this.pendingBalance < amount) throw new Error('Insufficient pending balance');
  
  this.pendingBalance -= amount;
  this.lastTransaction = new Date();
  
  return this.save();
};

// Method untuk cek apakah saldo cukup
walletSchema.methods.hasSufficientBalance = function(amount) {
  return this.balance >= amount;
};

// Static Methods
walletSchema.statics.findByUser = function(userId) {
  return this.findOne({ userId, isActive: true });
};

walletSchema.statics.createWallet = async function(userId) {
  const existingWallet = await this.findOne({ userId });
  if (existingWallet) {
    throw new Error('Wallet already exists for this user');
  }
  
  return this.create({
    userId,
    balance: 0,
    pendingBalance: 0,
    availableBalance: 0
  });
};

// Static method untuk transfer antar wallet (user ke seller)
walletSchema.statics.transfer = async function(fromUserId, toUserId, amount, orderId, description = 'Payment transfer') {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Ambil wallet sender dan receiver
      const senderWallet = await this.findByUser(fromUserId).session(session);
      const receiverWallet = await this.findByUser(toUserId).session(session);
      
      if (!senderWallet) throw new Error('Sender wallet not found');
      if (!receiverWallet) throw new Error('Receiver wallet not found');
      if (!senderWallet.hasSufficientBalance(amount)) throw new Error('Insufficient balance');
      
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
      const WalletTransaction = mongoose.model('WalletTransaction');
      
      await WalletTransaction.create([
        {
          userId: fromUserId,
          type: 'payment',
          amount: -amount,
          description,
          orderId,
          balanceAfter: senderWallet.balance,
          pendingBalanceAfter: senderWallet.pendingBalance
        },
        {
          userId: toUserId,
          type: 'receive_pending',
          amount: amount,
          description: `Pending ${description}`,
          orderId,
          balanceAfter: receiverWallet.balance,
          pendingBalanceAfter: receiverWallet.pendingBalance
        }
      ], { session });
      
      return { senderWallet, receiverWallet };
    });
  } finally {
    await session.endSession();
  }
};

// Pre-save middleware
walletSchema.pre('save', function(next) {
  // Update availableBalance
  this.availableBalance = this.balance;
  next();
});

// Transform output
walletSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Hapus field sensitif
    delete ret.pin;
    return ret;
  }
});

module.exports = mongoose.model('Wallet', walletSchema);