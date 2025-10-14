// cancel-request.model.js - FIXED: Remove problematic populate
const mongoose = require("mongoose");

const cancelItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    priceAtPurchase: {
      type: Number,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const itemResponseSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    response: {
      type: String,
      enum: ["approved", "rejected"],
      required: true,
    },
    responseReason: {
      type: String,
      maxlength: 500,
    },
  },
  { _id: false }
);

const sellerResponseSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
    },
    itemResponses: [itemResponseSchema],
    respondedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const cancelRequestSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    itemsToCancel: [cancelItemSchema],
    generalReason: {
      type: String,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "partial"],
      default: "pending",
    },
    sellerResponses: [sellerResponseSchema],
    requiredSellers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SellerProfile",
      },
    ],
    approvedItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    rejectedItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    refundAmount: {
      type: Number,
      default: 0,
    },
    processedAt: Date,
    processedBy: {
      type: String,
      enum: ["system", "admin"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
cancelRequestSchema.index({ orderId: 1 });
cancelRequestSchema.index({ userId: 1, status: 1 });
cancelRequestSchema.index({ "sellerResponses.sellerId": 1, status: 1 });
cancelRequestSchema.index({ status: 1, createdAt: -1 });
cancelRequestSchema.index({ requiredSellers: 1, status: 1 });

cancelRequestSchema.methods.isAllSellersResponded = function () {
  return this.sellerResponses.length === this.requiredSellers.length;
};

cancelRequestSchema.methods.isAllItemsApproved = function () {
  if (!this.isAllSellersResponded()) return false;

  const allItemResponses = this.sellerResponses.flatMap(sr => sr.itemResponses);
  return allItemResponses.every(ir => ir.response === "approved");
};

cancelRequestSchema.methods.isAllItemsRejected = function () {
  if (!this.isAllSellersResponded()) return false;

  const allItemResponses = this.sellerResponses.flatMap(sr => sr.itemResponses);
  return allItemResponses.every(ir => ir.response === "rejected");
};

cancelRequestSchema.methods.addSellerItemResponses = async function (sellerId, itemResponses) {
  const existingResponse = this.sellerResponses.find(r => r.sellerId.equals(sellerId));

  if (existingResponse) {
    throw new Error("Seller has already responded to this cancel request");
  }

  const isRequired = this.requiredSellers.some(id => id.equals(sellerId));
  if (!isRequired) {
    throw new Error("Seller is not required to respond to this cancel request");
  }

  const sellerItemIds = this.itemsToCancel
    .filter(item => item.sellerId.equals(sellerId))
    .map(item => item.productId.toString());

  for (const itemResponse of itemResponses) {
    if (!sellerItemIds.includes(itemResponse.productId.toString())) {
      throw new Error(`Seller does not own product ${itemResponse.productId}`);
    }
  }

  if (itemResponses.length !== sellerItemIds.length) {
    throw new Error("Must respond to all your items in this cancel request");
  }

  this.sellerResponses.push({
    sellerId,
    itemResponses,
    respondedAt: new Date(),
  });

  return this.save();
};

cancelRequestSchema.methods.processItemLevelRequest = async function () {
  if (!this.isAllSellersResponded()) {
    throw new Error("Not all sellers have responded yet");
  }

  if (this.status !== "pending") {
    throw new Error("Cancel request is already processed");
  }

  this.approvedItems = [];
  this.rejectedItems = [];

  for (const sellerResponse of this.sellerResponses) {
    for (const itemResponse of sellerResponse.itemResponses) {
      if (itemResponse.response === "approved") {
        this.approvedItems.push(itemResponse.productId);
      } else {
        this.rejectedItems.push(itemResponse.productId);
      }
    }
  }

  if (this.approvedItems.length === this.itemsToCancel.length) {
    this.status = "approved";
  } else if (this.rejectedItems.length === this.itemsToCancel.length) {
    this.status = "rejected";
  } else {
    this.status = "partial";
  }

  this.refundAmount = this.itemsToCancel
    .filter(item => this.approvedItems.some(id => id.equals(item.productId)))
    .reduce((sum, item) => sum + item.subtotal, 0);

  this.processedAt = new Date();
  this.processedBy = "system";

  return this.save();
};

// ✅ FIX: Remove populate and add proper ObjectId comparison
cancelRequestSchema.statics.createItemLevelRequest = async function (orderId, userId, itemsToCancel) {
  const Order = require("./order.model");

  // ✅ DON'T populate - cartSnapshot.items.product is already an ObjectId
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const enrichedItems = [];
  const requiredSellers = new Set();

  for (const cancelItem of itemsToCancel) {
    // ✅ Convert both to strings for comparison
    const orderItem = order.cartSnapshot.items.find(
      item => item.product.toString() === cancelItem.productId.toString()
    );

    if (!orderItem) {
      throw new Error(`Product ${cancelItem.productId} not found in order`);
    }

    // Check item status
    const itemStatus = order.itemStatuses?.find(is => is.product.toString() === cancelItem.productId.toString());

    if (itemStatus && ["shipped", "delivered", "received"].includes(itemStatus.status)) {
      throw new Error(`Cannot cancel ${orderItem.productSnapshot.title} - already ${itemStatus.status}`);
    }

    const sellerId = orderItem.productSnapshot.seller._id;
    requiredSellers.add(sellerId.toString());

    enrichedItems.push({
      productId: orderItem.product,
      sellerId: sellerId,
      quantity: cancelItem.quantity || orderItem.quantity,
      reason: cancelItem.reason,
      priceAtPurchase: orderItem.priceAtPurchase,
      subtotal: orderItem.priceAtPurchase * (cancelItem.quantity || orderItem.quantity),
    });
  }

  if (enrichedItems.length === 0) {
    throw new Error("No valid items to cancel");
  }

  let cleanReason = itemsToCancel[0]?.reason || "Customer requested cancellation";

  // Hapus prefix "Reason: " jika ada
  if (cleanReason.startsWith("Reason: ")) {
    cleanReason = cleanReason.replace("Reason: ", "");
  }

  const cancelRequest = new this({
    orderId,
    userId,
    itemsToCancel: enrichedItems,
    generalReason: cleanReason, // ← Gunakan yang sudah di-clean
    requiredSellers: Array.from(requiredSellers).map(id => new mongoose.Types.ObjectId(id)),
  });

  return cancelRequest.save();
};

cancelRequestSchema.statics.getPendingRequestsForSeller = function (sellerId, options = {}) {
  const { page = 1, limit = 10 } = options;

  return this.find({
    status: "pending",
    requiredSellers: sellerId,
    "sellerResponses.sellerId": { $ne: sellerId },
  })
    .populate("orderId", "orderNumber totalAmount status createdAt")
    .populate("userId", "username email")
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

cancelRequestSchema.methods.getSellerItems = function (sellerId) {
  return this.itemsToCancel.filter(item => item.sellerId.equals(sellerId));
};

module.exports = mongoose.model("CancelRequest", cancelRequestSchema);
