const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true, // ← This creates index automatically
    uppercase: true,
    trim: true,
    maxlength: 20
  },
  discount: {
    type: Number,
    required: true,
    min: 1,
    max: 100 // percentage
  },
  category: {
    type: String,
    required: false,
    lowercase: true,
    trim: true
  },
  minAmount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  maxDiscount: {
    type: Number,
    required: true,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiryDate: {
    type: Date,
    required: false
  },
  usageLimit: {
    type: Number,
    required: false,
    min: 1
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  }
}, {
  timestamps: true
});

// Index untuk optimasi query - REMOVED duplicate code index
couponSchema.index({ category: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ expiryDate: 1 });

// Static method untuk mencari coupon yang valid
couponSchema.statics.findValidCoupon = async function(code) {
  const now = new Date();
  
  return await this.findOne({
    code: code.toUpperCase(),
    isActive: true,
    $or: [
      { expiryDate: { $exists: false } },
      { expiryDate: { $gte: now } }
    ],
    $or: [
      { usageLimit: { $exists: false } },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
    ]
  });
};

// Method untuk menggunakan coupon (increment usage count)
couponSchema.methods.use = async function() {
  if (this.usageLimit && this.usedCount >= this.usageLimit) {
    throw new Error('Coupon usage limit exceeded');
  }
  
  this.usedCount += 1;
  return await this.save();
};

// Virtual untuk menghitung sisa penggunaan
couponSchema.virtual('remainingUsage').get(function() {
  if (!this.usageLimit) return null;
  return Math.max(0, this.usageLimit - this.usedCount);
});

// Virtual untuk mengecek apakah coupon masih valid
couponSchema.virtual('isValid').get(function() {
  const now = new Date();
  
  if (!this.isActive) return false;
  if (this.expiryDate && this.expiryDate < now) return false;
  if (this.usageLimit && this.usedCount >= this.usageLimit) return false;
  
  return true;
});

// Transform output untuk menghilangkan field sensitif
couponSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Coupon', couponSchema);