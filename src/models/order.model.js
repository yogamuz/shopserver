// order.model.js - UPDATED WITH SHOPPAY INTEGRATION
const mongoose = require("mongoose");

// Schema untuk item dalam order dengan snapshot lengkap dari cart
const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    // Snapshot data produk saat order dibuat
    productSnapshot: {
      title: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String },
      category: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
        name: { type: String },
        description: { type: String },
      },
      seller: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "SellerProfile" },
        storeName: { type: String },
        storeSlug: { type: String },
        storeLogo: { type: String },
      },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    priceAtPurchase: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

// Schema untuk coupon yang diaplikasikan (snapshot dari cart)
const orderCouponSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    discount: {
      type: Number,
      required: true,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    appliedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

// order.model.js - TAMBAHKAN schema ini setelah orderCouponSchema

const itemStatusSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "packed", "shipped", "delivered", "received", "cancelled"],
      default: "pending",
    },
    trackingNumber: String,
    courier: String,
    estimatedDelivery: Date,
    timestamps: {
      shippedAt: Date,
      deliveredAt: Date,
      receivedAt: Date,
    },
  },
  { _id: false }
);

const parcelSchema = new mongoose.Schema(
  {
    parcelId: {
      type: String,
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    status: {
      type: String,
      enum: ["pending", "packed", "shipped", "delivered", "received", "cancelled"],
      default: "pending",
    },
    trackingNumber: String,
    courier: String,
    estimatedDelivery: Date,
    timestamps: {
      packedAt: Date,
      shippedAt: Date,
      deliveredAt: Date,
      receivedAt: Date,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderNumber: {
      type: String,
      required: true,
    },

    itemStatuses: [itemStatusSchema],
    parcels: [parcelSchema],

    // Snapshot lengkap dari cart saat order dibuat
    cartSnapshot: {
      cartId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart",
        required: true,
      },
      items: [orderItemSchema],
      appliedCoupon: orderCouponSchema,
      totalItems: {
        type: Number,
        required: true,
        min: 0,
      },
      totalPrice: {
        type: Number,
        required: true,
        min: 0,
      },
      finalPrice: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    // Summary untuk kemudahan query
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalItems: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "packed",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
        "received",
        "cancellation_requested",
      ],
      default: "pending",
    },
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, default: "Indonesia" },
      fullAddress: String, // untuk kemudahan display
    },
    paymentMethod: {
      type: String,
      enum: ["shop_pay"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentDetails: {
      transactionId: String,
      paymentGateway: String,
      paidAt: Date,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    // Tracking informasi
    tracking: {
      trackingNumber: String,
      courier: String,
      estimatedDelivery: Date,
      actualDelivery: Date,
    },
    // Timestamps untuk berbagai status
    timestamps: {
      orderedAt: {
        type: Date,
        default: Date.now,
      },
      packedAt: Date,
      confirmedAt: Date,
      shippedAt: Date,
      deliveredAt: Date,
      receivedAt: Date, // Field baru untuk konfirmasi user
      cancelledAt: Date,
    },
    expiresAt: {
      // ✅ BENAR - di root level
      type: Date,
      required: function () {
        return this.status === "pending" && this.paymentStatus === "pending";
      },
      index: true,
    },
    cancelRequest: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CancelRequest",
        default: null,
      },
      reason: {
        type: String,
        maxLength: 500,
        default: null,
      },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: null,
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      processedAt: {
        type: Date,
        default: null,
      },
    },

    // Field baru untuk feedback customer - UPDATED WITH OPTIONAL RATING
    customerFeedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        required: false, // CHANGED: Rating is now optional
        default: null,
      },

      review: {
        type: String,
        maxlength: 1000,
        required: false, // Reviews are also optional at order level
        default: null,
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      // NEW: Track if individual product reviews were created
      hasProductReviews: {
        type: Boolean,
        default: false,
      },
      productReviewsCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes untuk performa
orderSchema.index({ user: 1, status: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "cartSnapshot.items.product": 1 });
// Index untuk cancel request queries
orderSchema.index({ status: 1, "cancelRequest.status": 1 });
orderSchema.index({ "cancelRequest.id": 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({
  "cartSnapshot.items.productSnapshot.seller._id": 1,
  status: 1,
  createdAt: -1,
});

// Index untuk customer search
orderSchema.index({
  "cartSnapshot.items.productSnapshot.seller._id": 1,
  user: 1,
});

// Index untuk product name search
orderSchema.index({
  "cartSnapshot.items.productSnapshot.seller._id": 1,
  "cartSnapshot.items.productSnapshot.title": "text",
});

// Index untuk expiration checker
orderSchema.index(
  {
    status: 1,
    paymentStatus: 1,
    expiresAt: 1,
  },
  {
    partialFilterExpression: {
      status: "pending",
      paymentStatus: "pending",
      expiresAt: { $exists: true },
    },
  }
);
// Virtual untuk menghitung discount amount
orderSchema.virtual("discountAmount").get(function () {
  return this.cartSnapshot.totalPrice - this.cartSnapshot.finalPrice;
});

// Virtual untuk check if order is ShopPay
orderSchema.virtual("isShopPay").get(function () {
  return this.paymentMethod === "shop_pay";
});

// Method untuk generate order number
orderSchema.statics.generateOrderNumber = async function () {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  const prefix = `ORD${year}${month}${day}`;

  // Cari order terakhir hari ini
  const lastOrder = await this.findOne({
    orderNumber: new RegExp(`^${prefix}`),
  }).sort({ orderNumber: -1 });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(4, "0")}`;
};

// Line ~415-480 - REPLACE createFromCart dengan validation lebih ketat
orderSchema.statics.createFromCart = async function (userId, cartData, orderDetails) {
  const { shippingAddress, paymentMethod, notes } = orderDetails;

  const orderNumber = await this.generateOrderNumber();

  // Line ~430-470 - REPLACE bagian seller mapping dengan logging
  const cartSnapshot = {
    cartId: cartData._id,
    items: cartData.items.map(item => {
      let sellerData = null;

      if (item.product.sellerId) {
        const seller = item.product.sellerId;

        // ✅ DEBUG: Log seller object

        // ✅ CRITICAL: Validate seller is properly populated
        if (typeof seller === "object" && seller !== null && seller._id) {
          sellerData = {
            _id: seller._id,
            userId: seller.userId || null,
            storeName: seller.storeName || "Unknown Store",
            storeSlug: seller.storeSlug || null,
            storeLogo: seller.logo || null, // ✅ CRITICAL: seller.logo (bukan seller.storeLogo)
          };

          // ✅ DEBUG: Log captured seller data
        } else {
          const errorMsg = `Product ${item.product._id} (${item.product.title}) has invalid seller data`;
          console.error(errorMsg, { seller });
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `Product ${item.product._id} (${item.product.title}) has no seller`;
        throw new Error(errorMsg);
      }

      // ✅ Double check sellerData valid
      if (!sellerData || !sellerData._id) {
        throw new Error(`Failed to capture seller data for product ${item.product.title}`);
      }

      return {
        product: item.product._id,
        productSnapshot: {
          title: item.product.title,
          description: item.product.description,
          image: item.product.image,
          category: {
            _id: item.product.category._id,
            name: item.product.category.name,
            description: item.product.category.description,
          },
          seller: sellerData, // ✅ This contains storeLogo
        },
        quantity: item.quantity,
        priceAtPurchase: item.priceAtAddition,
        subtotal: item.priceAtAddition * item.quantity,
      };
    }),
    appliedCoupon: cartData.appliedCoupon,
    totalItems: cartData.totalItems,
    totalPrice: cartData.totalPrice,
    finalPrice: cartData.finalPrice,
  };

  // Semua items sudah guaranteed valid karena map() di atas akan throw jika ada masalah
  const validItems = cartSnapshot.items;

  const itemStatuses = validItems.map(item => ({
    product: item.product,
    sellerId: item.productSnapshot.seller._id,
    status: "pending",
    timestamps: {},
  }));

  const parcelsBySeller = {};
  validItems.forEach(item => {
    const sellerId = item.productSnapshot.seller._id.toString();
    if (!parcelsBySeller[sellerId]) {
      parcelsBySeller[sellerId] = {
        sellerId: item.productSnapshot.seller._id,
        storeName: item.productSnapshot.seller.storeName,
        items: [],
      };
    }
    parcelsBySeller[sellerId].items.push(item.product);
  });

  const parcels = Object.values(parcelsBySeller).map((parcel, index) => ({
    parcelId: `${orderNumber}-P${index + 1}`,
    sellerId: parcel.sellerId,
    items: parcel.items,
    status: "pending",
    timestamps: {},
  }));

  const finalShippingAddress = {
    street: shippingAddress.street,
    city: shippingAddress.city,
    state: shippingAddress.state,
    zipCode: shippingAddress.zipCode,
    country: shippingAddress.country || "Indonesia",
  };

  const order = new this({
    user: userId,
    orderNumber,
    cartSnapshot,
    itemStatuses,
    parcels,
    totalAmount: cartData.finalPrice,
    totalItems: cartData.totalItems,
    shippingAddress: {
      ...finalShippingAddress,
      fullAddress: `${finalShippingAddress.street}, ${finalShippingAddress.city}, ${finalShippingAddress.state} ${finalShippingAddress.zipCode}, ${finalShippingAddress.country}`,
    },
    paymentMethod,
    notes,
    timestamps: {
      orderedAt: new Date(),
    },
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 detik buat demo expired payment
  });

  return order.save();
};

orderSchema.methods.pack = function () {
  this.status = "packed";
  this.timestamps.packedAt = new Date();

  if (this.itemStatuses && this.itemStatuses.length > 0) {
    this.itemStatuses = this.itemStatuses.map(item => {
      const itemObj = item.toObject ? item.toObject() : item;
      return {
        ...itemObj,
        status: "packed",
        timestamps: {
          ...itemObj.timestamps,
          packedAt: new Date(),
        },
      };
    });
  }

  return this.save();
};

orderSchema.methods.confirm = function () {
  this.status = "confirmed";
  this.timestamps.confirmedAt = new Date();
  return this.save();
};

orderSchema.methods.ship = function (trackingDetails = {}) {
  this.status = "shipped";
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

orderSchema.methods.deliver = function () {
  this.status = "delivered";
  this.timestamps.deliveredAt = new Date();
  this.tracking.actualDelivery = new Date();

  // Schedule auto-receive after 7 days
  setTimeout(async () => {
    try {
      const currentOrder = await mongoose.model("Order").findById(this._id);
      if (currentOrder && currentOrder.status === "delivered") {
        await currentOrder.autoReceive();

        // Process seller payments after auto-receive
        const SellerTransactionService = require("../../services/order/seller-transaction.service");
        await SellerTransactionService.processSellerPaymentsAfterConfirmation(currentOrder);
      }
    } catch (error) {
      console.error("Auto-receive scheduling failed:", error);
    }
  }, 7 * 24 * 60 * 60 * 1000); // 7 days

  return this.save();
};

orderSchema.methods.autoReceive = function () {
  this.status = "received";
  this.timestamps.receivedAt = new Date();
  // Mark as auto-received for tracking
  this.notes = this.notes
    ? `${this.notes}\n\nAuto-confirmed as received after 2 hours.`
    : `Auto-confirmed as received after 2 hours.`;
  return this.save();
};

orderSchema.methods.cancel = function (reason = "") {
  this.status = "cancelled";
  this.paymentStatus = "failed";
  this.timestamps.cancelledAt = new Date();
  if (reason) {
    this.notes = this.notes ? `${this.notes}\n\ Reason: ${reason}` : `Reason: ${reason}`;
  }
  return this.save();
};

orderSchema.methods.markAsPaid = function (paymentDetails = {}) {
  this.paymentStatus = "paid";
  this.paymentDetails = {
    ...this.paymentDetails,
    ...paymentDetails,
    paidAt: new Date(),
  };
  return this.save();
};

orderSchema.methods.refund = function () {
  this.paymentStatus = "refunded";
  this.status = "refunded";
  return this.save();
};

// Method untuk get seller earnings dari order ini
orderSchema.methods.getSellerEarnings = function (sellerId) {
  const sellerItems = this.cartSnapshot.items.filter(
    item => item.productSnapshot.seller && item.productSnapshot.seller._id.equals(sellerId)
  );

  return sellerItems.reduce((total, item) => {
    return total + item.priceAtPurchase * item.quantity;
  }, 0);
};

// Method untuk check apakah seller memiliki produk di order ini
orderSchema.methods.hasSellerProducts = function (sellerId) {
  return this.cartSnapshot.items.some(
    item => item.productSnapshot.seller && item.productSnapshot.seller._id.equals(sellerId)
  );
};

// Method untuk get semua seller yang terlibat di order ini
orderSchema.methods.getInvolvedSellers = function () {
  const sellers = new Set();
  this.cartSnapshot.items.forEach(item => {
    if (item.productSnapshot.seller) {
      sellers.add(item.productSnapshot.seller._id.toString());
    }
  });
  return Array.from(sellers);
};

// REPLACE method syncParcelStatuses di order.model.js (sekitar line 420)
orderSchema.methods.syncParcelStatuses = function () {
  if (!this.parcels || !this.itemStatuses) return this;

  let hasChanges = false;

  this.parcels.forEach((parcel, index) => {
    const parcelItemStatuses = this.itemStatuses
      .filter(itemStatus => parcel.items.some(pid => pid.equals(itemStatus.product)))
      .map(is => is.status);

    if (parcelItemStatuses.length === 0) return;

    const uniqueStatuses = [...new Set(parcelItemStatuses)];
    const currentParcelStatus = this.parcels[index].status;

    let newStatus = currentParcelStatus;

    if (uniqueStatuses.length === 1) {
      newStatus = uniqueStatuses[0];
    } else {
      if (parcelItemStatuses.some(s => s === "delivered")) {
        newStatus = "delivered";
      } else if (parcelItemStatuses.some(s => s === "shipped")) {
        newStatus = "shipped";
      } else if (parcelItemStatuses.some(s => s === "packed")) {
        newStatus = "packed";
      }
    }

    // Only update if status changed
    if (currentParcelStatus !== newStatus) {
      this.parcels[index].status = newStatus;
      hasChanges = true;

      if (!this.parcels[index].timestamps) {
        this.parcels[index].timestamps = {};
      }

      const now = new Date();
      switch (newStatus) {
        case "packed":
          if (!this.parcels[index].timestamps.packedAt) {
            this.parcels[index].timestamps.packedAt = now;
          }
          break;
        case "shipped":
          if (!this.parcels[index].timestamps.shippedAt) {
            this.parcels[index].timestamps.shippedAt = now;
          }
          break;
        case "delivered":
          if (!this.parcels[index].timestamps.deliveredAt) {
            this.parcels[index].timestamps.deliveredAt = now;
          }
          break;
        case "received":
          if (!this.parcels[index].timestamps.receivedAt) {
            this.parcels[index].timestamps.receivedAt = now;
          }
          break;
      }
    }
  });

  // Mark parcels as modified if changes occurred
  if (hasChanges) {
    this.markModified("parcels");
  }

  return this;
};

// Di order.model.js - tambahkan method untuk auto-update order status
orderSchema.methods.updateOrderStatusFromItems = function () {
  if (!this.itemStatuses || this.itemStatuses.length === 0) return;

  const statuses = this.itemStatuses.map(is => is.status);

  // Logic: order status = most advanced item status
  if (statuses.every(s => s === "delivered")) {
    this.status = "delivered";
  } else if (statuses.some(s => s === "delivered")) {
    this.status = "partially_delivered"; // NEW STATUS
  } else if (statuses.every(s => s === "shipped")) {
    this.status = "shipped";
  } else if (statuses.some(s => s === "shipped")) {
    this.status = "partially_shipped"; // NEW STATUS
  } else if (statuses.every(s => s === "packed")) {
    this.status = "packed";
  }

  return this;
};

// Static method untuk find orders by seller
orderSchema.statics.findByseller = function (sellerId, options = {}) {
  const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = -1 } = options;

  const query = {
    "cartSnapshot.items.productSnapshot.seller._id": sellerId,
  };

  if (status) {
    query.status = status;
  }

  return this.find(query)
    .sort({ [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate("user", "username email");
};

// Static method untuk get seller statistics
orderSchema.statics.getSellerStats = async function (sellerId, period = "30d") {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  const stats = await this.aggregate([
    {
      $match: {
        "cartSnapshot.items.productSnapshot.seller._id": new mongoose.Types.ObjectId(sellerId),
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $ne: "cancelled" },
      },
    },
    {
      $unwind: "$cartSnapshot.items",
    },
    {
      $match: {
        "cartSnapshot.items.productSnapshot.seller._id": new mongoose.Types.ObjectId(sellerId),
      },
    },
    {
      $group: {
        _id: "$status",
        totalOrders: { $addToSet: "$_id" },
        totalItems: { $sum: "$cartSnapshot.items.quantity" },
        totalEarnings: {
          $sum: {
            $multiply: ["$cartSnapshot.items.priceAtPurchase", "$cartSnapshot.items.quantity"],
          },
        },
      },
    },
    {
      $addFields: {
        orderCount: { $size: "$totalOrders" },
      },
    },
    {
      $project: {
        totalOrders: 0,
      },
    },
  ]);

  return stats;
};

// Pre-save middleware
orderSchema.pre("save", function (next) {
  // Update fullAddress
  if (this.isModified("shippingAddress") && this.shippingAddress) {
    const addr = this.shippingAddress;
    this.shippingAddress.fullAddress = `${addr.street}, ${addr.city}, ${addr.state} ${addr.zipCode}, ${addr.country}`;
  }

  // ✅ Sync parcel statuses with item statuses
  if (this.isModified("itemStatuses") || this.isModified("parcels")) {
    this.syncParcelStatuses();
  }

  next();
});

// Post-save middleware untuk auto-scheduling delivery
orderSchema.post("save", function (doc) {
  // Auto-schedule delivery jika status berubah ke shipped
  if (doc.status === "shipped" && doc.timestamps.shippedAt) {
    // Update auto-delivery timing from 1 hour to 5 minutes (300000 ms)
    setTimeout(async () => {
      try {
        const currentOrder = await mongoose.model("Order").findById(doc._id);
        if (currentOrder && currentOrder.status === "shipped") {
          // Import OrderController untuk auto-delivery
          const OrderController = require("../controllers/user/order.controller");
          if (OrderController.autoDeliverOrder) {
            await OrderController.autoDeliverOrder(currentOrder);
          }
        }
      } catch (error) {
        console.error("Auto-delivery scheduling failed:", error);
      }
    }, 0.5 * 60 * 1000); // 5 minutes (300000 ms) for demo
  }
});

// Transform output
orderSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    // Tambahkan computed fields
    ret.discountAmount = ret.cartSnapshot.totalPrice - ret.cartSnapshot.finalPrice;
    ret.hasDiscount = ret.discountAmount > 0;
    ret.isShopPay = ret.paymentMethod === "shop_pay";

    // Add status badges untuk frontend
    ret.statusInfo = {
      status: ret.status,
      canCancel: ["pending", "packed"].includes(ret.status),
      canShip: ret.status === "packed",
      canDeliver: ret.status === "shipped",
      isCompleted: ret.status === "delivered",
      isCancelled: ["cancelled", "refunded"].includes(ret.status),
      displayStatus: OrderController?.getDisplayStatus ? OrderController.getDisplayStatus(ret.status) : ret.status,
    };

    // Payment info
    ret.paymentInfo = {
      method: ret.paymentMethod,
      status: ret.paymentStatus,
      isShopPay: ret.paymentMethod === "shop_pay",
      paidAt: ret.paymentDetails?.paidAt,
      canRefund: ret.paymentStatus === "paid" && ["cancelled", "refunded"].includes(ret.status),
    };

    return ret;
  },
});

// Static method untuk display status mapping
orderSchema.statics.getDisplayStatus = function (status) {
  const statusMap = {
    pending: "Menunggu Pembayaran",
    packed: "Dikemas",
    confirmed: "Dikonfirmasi",
    processing: "Diproses",
    shipped: "Dikirim",
    delivered: "Diterima",
    cancelled: "Dibatalkan",
    refunded: "Dikembalikan",
  };

  return statusMap[status] || status;
};

// Static method untuk get order summary
orderSchema.statics.getOrderSummary = async function (userId, options = {}) {
  const { isSellerView = false, sellerId = null } = options;

  let matchQuery =
    isSellerView && sellerId ? { "cartSnapshot.items.productSnapshot.seller._id": sellerId } : { user: userId };

  const summary = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
      },
    },
  ]);

  const result = {
    total: 0,
    totalAmount: 0,
    byStatus: {},
  };

  summary.forEach(item => {
    result.total += item.count;
    result.totalAmount += item.totalAmount;
    result.byStatus[item._id] = {
      count: item.count,
      totalAmount: item.totalAmount,
    };
  });

  return result;
};
orderSchema.statics.checkAutoReceiveOrders = async function () {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const ordersToAutoReceive = await this.find({
      status: "delivered",
      "timestamps.deliveredAt": { $lte: sevenDaysAgo },
      "timestamps.receivedAt": null,
    });

    const processedOrders = [];

    for (const order of ordersToAutoReceive) {
      await order.autoReceive();

      // Process seller payments
      const SellerTransactionService = require("../../services/order/seller-transaction.service");
      await SellerTransactionService.processSellerPaymentsAfterConfirmation(order);

      processedOrders.push(order.orderNumber);
    }

    return {
      autoReceivedCount: processedOrders.length,
      autoReceivedOrders: processedOrders,
    };
  } catch (error) {
    console.error("Error checking auto-receive orders:", error);
    throw error;
  }
};
// Static method untuk start auto-receive checker
orderSchema.statics.startAutoReceiveChecker = function () {
  // Check every 24 hours
  setInterval(async () => {
    try {
      await this.checkAutoReceiveOrders();
    } catch (error) {
      console.error("Auto-receive checker error:", error);
    }
  }, 30 * 60 * 1000);
};
module.exports = mongoose.model("Order", orderSchema);
