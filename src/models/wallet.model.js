// wallet.model.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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


// Instance Methods (keep only basic methods)
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

// Method untuk mengkonversi pending balance ke available balance (saat order completed) - FIXED
walletSchema.methods.confirmPendingBalance = async function(amount, description = 'Order completed') {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (this.pendingBalance < amount) throw new Error('Insufficient pending balance');
  
  this.pendingBalance -= amount;
  this.balance += amount;
  this.availableBalance = this.balance;
  this.lastTransaction = new Date();
  
  // Use save() instead of returning this.save() to ensure proper session handling
  await this.save();
  return this;
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

// TAMBAHKAN DI SINI - validatePin method
walletSchema.methods.validatePin = async function(pin) {
  console.log('=== PIN VALIDATION DEBUG ===');
  console.log('Input PIN:', pin, 'Type:', typeof pin);
  console.log('Stored PIN hash:', this.pin);
  console.log('PIN exists in wallet:', !!this.pin);
  
  if (!this.pin) {
    console.log('No PIN set in wallet');
    return false;
  }
  
  const result = await bcrypt.compare(pin, this.pin);
  console.log('bcrypt.compare result:', result);
  console.log('=== END PIN DEBUG ===');
  
  return result
  // Compare PIN yang diinput dengan PIN yang ter-hash
};

// Di wallet.model.js, tambahkan method ini setelah validatePin
walletSchema.methods.setPin = async function(newPin) {
  const saltRounds = 10;
  this.pin = await bcrypt.hash(newPin, saltRounds);
  return this.save();
};

// Method untuk filter response berdasarkan user role/context
walletSchema.methods.toUserResponse = function(viewerRole = 'user') {
  const obj = this.toObject({ virtuals: true });
  

  
  // Add id from _id
  obj.id = this._id;
  
  // Convert isActive to status
  obj.status = obj.isActive ? 'active' : 'inactive';
  delete obj.isActive;
  
  // Clean user data if populated
  if (obj.userId) {
    delete obj.userId._id;
    delete obj.userId.__v;
    obj.user = obj.userId;
    delete obj.userId;
  }
  
  return obj;
};

// Static Methods
walletSchema.statics.findByUser = function(userId) {
  return this.findOne({ userId, isActive: true });
};

// Static method untuk mencari wallet tanpa filter isActive (untuk admin)
walletSchema.statics.findByUserAdmin = function(userId) {
  return this.findOne({ userId });
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

// Static method untuk filter transactions berdasarkan privacy context
walletSchema.statics.filterTransactionsByContext = function(transactions, viewerRole = 'user', viewerUserId = null) {
  return transactions.map(transaction => {
    const txObj = transaction.toObject ? transaction.toObject() : transaction;
    
    // Remove internal fields
    delete txObj._id;
    delete txObj.__v;
    txObj.id = transaction._id;
    
    // Clean nested objects
    if (txObj.userId) {
      delete txObj.userId._id;
      delete txObj.userId.__v;
      txObj.user = txObj.userId;
      delete txObj.userId;
    }
    
    if (txObj.adminId) {
      delete txObj.adminId._id;
      delete txObj.adminId.__v;
      txObj.admin = txObj.adminId;
      delete txObj.adminId;
    }
    
    if (txObj.orderId) {
      delete txObj.orderId._id;
      delete txObj.orderId.__v;
      txObj.order = txObj.orderId;
      delete txObj.orderId;
    }
    
    if (txObj.sellerId) {
      delete txObj.sellerId._id;
      delete txObj.sellerId.__v;
      txObj.seller = txObj.sellerId;
      delete txObj.sellerId;
    }
    
    // Filter description based on context
    if (viewerRole === 'user' && txObj.user && txObj.user.id !== viewerUserId) {
      // User sedang melihat transaction yang bukan miliknya - hide sensitive info
      if (txObj.description && txObj.description.includes('Reason:')) {
        const parts = txObj.description.split(' - Reason:');
        txObj.description = parts[0]; // Remove reason part
      }
      
      // Generalize admin actions untuk privacy
      if (txObj.type === 'admin_deduct' && txObj.description.includes('deactivated')) {
        txObj.description = 'Wallet action by admin';
      }
    }
    
    // Admin can see everything, no filtering needed
    
    return txObj;
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
      
      // TAMBAHAN: Cari SellerProfile untuk receiver
      const SellerProfile = mongoose.model('SellerProfile');
      const sellerProfile = await SellerProfile.findOne({ userId: toUserId }).session(session);
      
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
          sellerId: sellerProfile ? sellerProfile._id : null, // PERBAIKAN: Isi sellerId
          balanceAfter: receiverWallet.balance,
          pendingBalanceAfter: receiverWallet.pendingBalance
        }
      ], { session, ordered: true });
      
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
  virtuals: true
  // HAPUS transform function
});

// Juga tambahkan setting untuk toObject agar konsisten
walletSchema.set('toObject', {
  virtuals: true
});

module.exports = mongoose.model('Wallet', walletSchema);