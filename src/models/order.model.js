// order.model.js - UPDATED WITH SHOPPAY INTEGRATION
const mongoose = require('mongoose');

// Schema untuk item dalam order dengan snapshot lengkap dari cart
const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  // Snapshot data produk saat order dibuat
  productSnapshot: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },
    category: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
      name: { type: String },
      description: { type: String }
    },
    seller: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerProfile' },
      storeName: { type: String },
      storeSlug: { type: String }
    }
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  priceAtPurchase: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

// Schema untuk coupon yang diaplikasikan (snapshot dari cart)
const orderCouponSchema = new mongoose.Schema({
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true
  },
  code: {
    type: String,
    required: true
  },
  discount: {
    type: Number,
    required: true
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 0
  },
  appliedAt: {
    type: Date,
    required: true
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  // Snapshot lengkap dari cart saat order dibuat
  cartSnapshot: {
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cart',
      required: true
    },
    items: [orderItemSchema],
    appliedCoupon: orderCouponSchema,
    totalItems: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  },
  // Summary untuk kemudahan query
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  totalItems: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'packed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, default: 'Indonesia' },
    fullAddress: String // untuk kemudahan display
  },
  paymentMethod: {
    type: String,
    enum: ['shop_pay'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentDetails: {
    transactionId: String,
    paymentGateway: String,
    paidAt: Date
  },
  notes: {
    type: String,
    maxlength: 500
  },
  // Tracking informasi
  tracking: {
    trackingNumber: String,
    courier: String,
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  // Timestamps untuk berbagai status
  timestamps: {
    orderedAt: {
      type: Date,
      default: Date.now
    },
    packedAt: Date,
    confirmedAt: Date,
    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date
  }
}, {
  timestamps: true
});

// Indexes untuk performa
orderSchema.index({ user: 1, status: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'cartSnapshot.items.product': 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ 'cartSnapshot.items.productSnapshot.seller._id': 1 });

// Virtual untuk menghitung discount amount
orderSchema.virtual('discountAmount').get(function() {
  return this.cartSnapshot.totalPrice - this.cartSnapshot.finalPrice;
});

// Virtual untuk check if order is ShopPay
orderSchema.virtual('isShopPay').get(function() {
  return this.paymentMethod === 'shop_pay';
});

// Method untuk generate order number
orderSchema.statics.generateOrderNumber = async function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const prefix = `ORD${year}${month}${day}`;
  
  // Cari order terakhir hari ini
  const lastOrder = await this.findOne({
    orderNumber: new RegExp(`^${prefix}`)
  }).sort({ orderNumber: -1 });
  
  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.slice(-4));
    sequence = lastSequence + 1;
  }
  
  return `${prefix}${String(sequence).padStart(4, '0')}`;
};

// Static method untuk create order dari cart
orderSchema.statics.createFromCart = async function(userId, cartData, orderDetails) {
  const {
    shippingAddress,
    useProfileAddress,
    paymentMethod,
    notes
  } = orderDetails;
  
  // Generate order number
  const orderNumber = await this.generateOrderNumber();
  
  // Determine final shipping address
  let finalShippingAddress;
  
  if (useProfileAddress) {
    // Jika menggunakan profile address, ambil dari user profile
    const Profile = require('./profile.model');
    const userProfile = await Profile.findByUser(userId);
    
    if (!userProfile || !userProfile.defaultAddress) {
      throw new Error('No default address found in user profile');
    }
    
    finalShippingAddress = {
      street: userProfile.defaultAddress.street,
      city: userProfile.defaultAddress.city,
      state: userProfile.defaultAddress.state,
      zipCode: userProfile.defaultAddress.zipCode,
      country: userProfile.defaultAddress.country || 'Indonesia'
    };
  } else {
    // Jika shippingAddress adalah string, parse menjadi object
    if (typeof shippingAddress === 'string') {
      finalShippingAddress = {
        street: shippingAddress,
        city: 'Unknown',
        state: 'Unknown', 
        zipCode: 'Unknown',
        country: 'Indonesia'
      };
    } else if (typeof shippingAddress === 'object' && shippingAddress !== null) {
      // Jika sudah object, gunakan langsung dengan default values
      finalShippingAddress = {
        street: shippingAddress.street || shippingAddress,
        city: shippingAddress.city || 'Unknown',
        state: shippingAddress.state || 'Unknown',
        zipCode: shippingAddress.zipCode || 'Unknown',
        country: shippingAddress.country || 'Indonesia'
      };
    } else {
      throw new Error('Invalid shipping address format');
    }
  }
  
  // Prepare cart snapshot dengan structure yang sama seperti response cart
  const cartSnapshot = {
    cartId: cartData._id,
    items: cartData.items.map(item => ({
      product: item.product._id,
      productSnapshot: {
        title: item.product.title,
        description: item.product.description,
        image: item.product.image,
        category: {
          _id: item.product.category._id,
          name: item.product.category.name,
          description: item.product.category.description
        },
        seller: item.product.seller ? {
          _id: item.product.seller._id,
          storeName: item.product.seller.storeName,
          storeSlug: item.product.seller.storeSlug
        } : null
      },
      quantity: item.quantity,
      priceAtPurchase: item.priceAtAddition,
      subtotal: item.priceAtAddition * item.quantity
    })),
    appliedCoupon: cartData.appliedCoupon,
    totalItems: cartData.totalItems,
    totalPrice: cartData.totalPrice,
    finalPrice: cartData.finalPrice
  };
  
  // Create order
  const order = new this({
    user: userId,
    orderNumber,
    cartSnapshot,
    totalAmount: cartData.finalPrice,
    totalItems: cartData.totalItems,
    shippingAddress: {
      ...finalShippingAddress,
      fullAddress: finalShippingAddress.fullAddress || 
        `${finalShippingAddress.street}, ${finalShippingAddress.city}, ${finalShippingAddress.state} ${finalShippingAddress.zipCode}, ${finalShippingAddress.country}`
    },
    paymentMethod,
    notes,
    timestamps: {
      orderedAt: new Date()
    }
  });
  
  return order.save();
};

// Instance methods untuk update status

// Method untuk pack order (after payment success for ShopPay)
orderSchema.methods.pack = function() {
  this.status = 'packed';
  this.timestamps.packedAt = new Date();
  return this.save();
};

orderSchema.methods.confirm = function() {
  this.status = 'confirmed';
  this.timestamps.confirmedAt = new Date();
  return this.save();
};

orderSchema.methods.ship = function(trackingDetails = {}) {
  this.status = 'shipped';
  this.timestamps.shippedAt = new Date();
  if (trackingDetails.trackingNumber) {
    this.tracking.trackingNumber = trackingDetails.trackingNumber;
  }
  if (trackingDetails.courier) {
    this.tracking.courier = trackingDetails.courier;
  }
  if (trackingDetails.estimatedDelivery) {
    this.tracking.estimatedDelivery = trackingDetails.estimatedDelivery;
  }
  return this.save();
};

orderSchema.methods.deliver = function() {
  this.status = 'delivered';
  this.timestamps.deliveredAt = new Date();
  this.tracking.actualDelivery = new Date();
  return this.save();
};

orderSchema.methods.cancel = function(reason = '') {
  this.status = 'cancelled';
  this.timestamps.cancelledAt = new Date();
  if (reason) {
    this.notes = this.notes ? `${this.notes}\n\nCancellation reason: ${reason}` : `Cancellation reason: ${reason}`;
  }
  return this.save();
};

orderSchema.methods.markAsPaid = function(paymentDetails = {}) {
  this.paymentStatus = 'paid';
  this.paymentDetails = {
    ...this.paymentDetails,
    ...paymentDetails,
    paidAt: new Date()
  };
  return this.save();
};

orderSchema.methods.refund = function() {
  this.paymentStatus = 'refunded';
  this.status = 'refunded';
  return this.save();
};

// Method untuk get seller earnings dari order ini
orderSchema.methods.getSellerEarnings = function(sellerId) {
  const sellerItems = this.cartSnapshot.items.filter(item => 
    item.productSnapshot.seller && 
    item.productSnapshot.seller._id.equals(sellerId)
  );
  
  return sellerItems.reduce((total, item) => {
    return total + (item.priceAtPurchase * item.quantity);
  }, 0);
};

// Method untuk check apakah seller memiliki produk di order ini
orderSchema.methods.hasSellerProducts = function(sellerId) {
  return this.cartSnapshot.items.some(item => 
    item.productSnapshot.seller && 
    item.productSnapshot.seller._id.equals(sellerId)
  );
};

// Method untuk get semua seller yang terlibat di order ini
orderSchema.methods.getInvolvedSellers = function() {
  const sellers = new Set();
  this.cartSnapshot.items.forEach(item => {
    if (item.productSnapshot.seller) {
      sellers.add(item.productSnapshot.seller._id.toString());
    }
  });
  return Array.from(sellers);
};

// Static method untuk find orders by seller
orderSchema.statics.findByseller = function(sellerId, options = {}) {
  const {
    status,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = -1
  } = options;
  
  const query = {
    'cartSnapshot.items.productSnapshot.seller._id': sellerId
  };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .sort({ [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate('user', 'username email');
};

// Static method untuk get seller statistics
orderSchema.statics.getSellerStats = async function(sellerId, period = '30d') {
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
    default:
      startDate.setDate(startDate.getDate() - 30);
  }
  
  const stats = await this.aggregate([
    {
      $match: {
        'cartSnapshot.items.productSnapshot.seller._id': new mongoose.Types.ObjectId(sellerId),
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $unwind: '$cartSnapshot.items'
    },
    {
      $match: {
        'cartSnapshot.items.productSnapshot.seller._id': new mongoose.Types.ObjectId(sellerId)
      }
    },
    {
      $group: {
        _id: '$status',
        totalOrders: { $addToSet: '$_id' },
        totalItems: { $sum: '$cartSnapshot.items.quantity' },
        totalEarnings: { 
          $sum: { 
            $multiply: [
              '$cartSnapshot.items.priceAtPurchase', 
              '$cartSnapshot.items.quantity'
            ]
          }
        }
      }
    },
    {
      $addFields: {
        orderCount: { $size: '$totalOrders' }
      }
    },
    {
      $project: {
        totalOrders: 0
      }
    }
  ]);
  
  return stats;
};

// Pre-save middleware
orderSchema.pre('save', function(next) {
  // Update fullAddress jika shippingAddress berubah
  if (this.isModified('shippingAddress') && this.shippingAddress) {
    const addr = this.shippingAddress;
    this.shippingAddress.fullAddress = `${addr.street}, ${addr.city}, ${addr.state} ${addr.zipCode}, ${addr.country}`;
  }
  
  next();
});

// Post-save middleware untuk auto-scheduling delivery
orderSchema.post('save', function(doc) {
  // Auto-schedule delivery jika status berubah ke shipped
  if (doc.status === 'shipped' && doc.timestamps.shippedAt) {
    // Schedule auto-delivery after 1 hour (3600000 ms)
    setTimeout(async () => {
      try {
        const currentOrder = await mongoose.model('Order').findById(doc._id);
        if (currentOrder && currentOrder.status === 'shipped') {
          // Import OrderController untuk auto-delivery
          const OrderController = require('../controllers/order.controller');
          if (OrderController.autoDeliverOrder) {
            await OrderController.autoDeliverOrder(currentOrder);
          }
        }
      } catch (error) {
        console.error('Auto-delivery scheduling failed:', error);
      }
    }, 3600000); // 1 hour
  }
});

// Transform output
orderSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Tambahkan computed fields
    ret.discountAmount = ret.cartSnapshot.totalPrice - ret.cartSnapshot.finalPrice;
    ret.hasDiscount = ret.discountAmount > 0;
    ret.isShopPay = ret.paymentMethod === 'shop_pay';
    
    // Add status badges untuk frontend
    ret.statusInfo = {
      status: ret.status,
      canCancel: ['pending', 'packed'].includes(ret.status),
      canShip: ret.status === 'packed',
      canDeliver: ret.status === 'shipped',
      isCompleted: ret.status === 'delivered',
      isCancelled: ['cancelled', 'refunded'].includes(ret.status),
      displayStatus: OrderController?.getDisplayStatus ? 
        OrderController.getDisplayStatus(ret.status) : ret.status
    };
    
    // Payment info
    ret.paymentInfo = {
      method: ret.paymentMethod,
      status: ret.paymentStatus,
      isShopPay: ret.paymentMethod === 'shop_pay',
      paidAt: ret.paymentDetails?.paidAt,
      canRefund: ret.paymentStatus === 'paid' && ['cancelled', 'refunded'].includes(ret.status)
    };
    
    return ret;
  }
});

// Static method untuk display status mapping
orderSchema.statics.getDisplayStatus = function(status) {
  const statusMap = {
    'pending': 'Menunggu Pembayaran',
    'packed': 'Dikemas',
    'confirmed': 'Dikonfirmasi',
    'processing': 'Diproses',
    'shipped': 'Dikirim',
    'delivered': 'Diterima',
    'cancelled': 'Dibatalkan',
    'refunded': 'Dikembalikan'
  };
  
  return statusMap[status] || status;
};

// Static method untuk get order summary
orderSchema.statics.getOrderSummary = async function(userId, options = {}) {
  const { isSellerView = false, sellerId = null } = options;
  
  let matchQuery = isSellerView && sellerId ? 
    { 'cartSnapshot.items.productSnapshot.seller._id': sellerId } :
    { user: userId };
  
  const summary = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);
  
  const result = {
    total: 0,
    totalAmount: 0,
    byStatus: {}
  };
  
  summary.forEach(item => {
    result.total += item.count;
    result.totalAmount += item.totalAmount;
    result.byStatus[item._id] = {
      count: item.count,
      totalAmount: item.totalAmount
    };
  });
  
  return result;
};

module.exports = mongoose.model('Order', orderSchema);