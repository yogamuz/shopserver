// user.model.js - UPDATED WITH WALLET INTEGRATION
const mongoose = require('mongoose');
const Cart = require('./cart.model');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please provide a valid email'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['user', 'seller', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Virtual untuk profile
userSchema.virtual('profile', {
  ref: 'Profile',
  localField: '_id',
  foreignField: 'user',
  justOne: true
});

// Virtual untuk wallet (ShopPay)
userSchema.virtual('wallet', {
  ref: 'Wallet',
  localField: '_id',
  foreignField: 'userId',
  justOne: true
});

// Virtual untuk seller profile
userSchema.virtual('sellerProfile', {
  ref: 'SellerProfile',
  localField: '_id',
  foreignField: 'userId',
  justOne: true
});

// Virtual untuk orders
userSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'user',
  justOne: false
});

// Add indexes
userSchema.index({ isActive: 1, role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ email: 1, isActive: 1 });

// Instance methods

// Method untuk create wallet otomatis
userSchema.methods.createWallet = async function() {
  const Wallet = require('./wallet.model');
  
  try {
    const existingWallet = await Wallet.findByUser(this._id);
    if (existingWallet) {
      return existingWallet;
    }
    
    return await Wallet.createWallet(this._id);
  } catch (error) {
    throw new Error('Failed to create wallet: ' + error.message);
  }
};

// Method untuk get wallet dengan auto-create
userSchema.methods.getWallet = async function() {
  const Wallet = require('./wallet.model');
  
  let wallet = await Wallet.findByUser(this._id);
  if (!wallet) {
    wallet = await this.createWallet();
  }
  
  return wallet;
};

// Method untuk check apakah user bisa melakukan pembayaran ShopPay
userSchema.methods.canPayWithShopPay = async function(amount) {
  try {
    const wallet = await this.getWallet();
    return {
      canPay: wallet.isActive && wallet.hasSufficientBalance(amount),
      wallet: wallet,
      balance: wallet.balance,
      isActive: wallet.isActive,
      shortfall: amount > wallet.balance ? amount - wallet.balance : 0
    };
  } catch (error) {
    return {
      canPay: false,
      error: error.message
    };
  }
};

// Method untuk get user summary dengan wallet info
userSchema.methods.getSummary = async function() {
  const wallet = await this.getWallet();
  
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
    wallet: {
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      totalBalance: wallet.totalBalance,
      isActive: wallet.isActive,
      lastTransaction: wallet.lastTransaction
    }
  };
};

// Static methods

// Method untuk find user with wallet info
userSchema.statics.findWithWallet = function(query = {}) {
  return this.find(query)
    .populate('wallet')
    .populate('profile')
    .populate('sellerProfile');
};

// Method untuk get users dengan wallet statistics
userSchema.statics.getUsersWithWalletStats = async function(options = {}) {
  const {
    page = 1,
    limit = 20,
    role,
    hasWallet,
    minBalance,
    maxBalance,
    search
  } = options;
  
  const pipeline = [
    // Match users
    {
      $match: {
        isActive: true,
        deletedAt: null,
        ...(role && { role }),
        ...(search && {
          $or: [
            { username: new RegExp(search, 'i') },
            { email: new RegExp(search, 'i') }
          ]
        })
      }
    },
    
    // Lookup wallet
    {
      $lookup: {
        from: 'wallets',
        localField: '_id',
        foreignField: 'userId',
        as: 'wallet'
      }
    },
    
    // Add wallet info
    {
      $addFields: {
        hasWallet: { $gt: [{ $size: '$wallet' }, 0] },
        walletBalance: {
          $cond: [
            { $gt: [{ $size: '$wallet' }, 0] },
            { $arrayElemAt: ['$wallet.balance', 0] },
            0
          ]
        }
      }
    },
    
    // Filter by wallet criteria
    ...(hasWallet !== undefined ? [{ $match: { hasWallet } }] : []),
    ...(minBalance ? [{ $match: { walletBalance: { $gte: minBalance } } }] : []),
    ...(maxBalance ? [{ $match: { walletBalance: { $lte: maxBalance } } }] : []),
    
    // Sort and paginate
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    
    // Clean up output
    {
      $project: {
        username: 1,
        email: 1,
        role: 1,
        isActive: 1,
        createdAt: 1,
        hasWallet: 1,
        wallet: { $arrayElemAt: ['$wallet', 0] }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Auto-create wallet untuk user baru (kecuali admin)
  if (this.isNew && this.role !== 'admin') {
    try {
      // Schedule wallet creation after user is saved
      process.nextTick(async () => {
        try {
          await this.createWallet();
        } catch (error) {
          console.error('Failed to auto-create wallet for user:', this._id, error.message);
        }
      });
    } catch (error) {
      console.error('Error scheduling wallet creation:', error);
    }
  }
  
  next();
});

// Pre-remove middleware
userSchema.pre('findOneAndDelete', async function (next) {
  const user = await this.model.findOne(this.getFilter());
  if (user) {
    // Delete cart
    await Cart.deleteMany({ $or: [{ userId: user._id }, { user: user._id }] });
    
    // Deactivate wallet instead of deleting (for audit trail)
    const Wallet = require('./wallet.model');
    await Wallet.updateOne(
      { userId: user._id },
      { 
        isActive: false,
        deletedAt: new Date()
      }
    );
  }
  next();
});

// Transform output
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Remove sensitive fields
    delete ret.password;
    delete ret.__v;
    delete ret.deletedAt;
    delete ret.deletedBy;
    
    return ret;
  }
});

userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);