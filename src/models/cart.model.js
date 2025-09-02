const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    priceAtAddition: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

// Schema untuk coupon yang diaplikasikan
const appliedCouponSchema = new mongoose.Schema(
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
      default: Date.now,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    appliedCoupon: appliedCouponSchema, // Tambahan field untuk coupon
    sessionId: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

cartSchema.index({ user: 1, isActive: 1 });
cartSchema.index({ "items.product": 1 });
cartSchema.index(
  { user: 1, "items.product": 1 },
  { unique: true, sparse: true }
);

cartSchema.methods.addProduct = function (productId, quantity, price) {
  const existingItemIndex = this.items.findIndex(
    (item) => item.product.toString() === productId.toString()
  );

  if (existingItemIndex >= 0) {
    this.items[existingItemIndex].quantity += quantity;
  } else {
    this.items.push({
      product: productId,
      quantity: quantity,
      priceAtAddition: price,
    });
  }

  return this.save();
};

cartSchema.methods.removeProduct = function (productId) {
  this.items = this.items.filter(
    (item) => item.product.toString() !== productId.toString()
  );
  return this.save();
};

cartSchema.methods.updateProductQuantity = function (productId, newQuantity) {
  const item = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (item) {
    item.quantity = newQuantity;
    return this.save();
  }

  throw new Error("Product not found in cart");
};

cartSchema.statics.findCartsWithProduct = function (productId) {
  return this.find({
    "items.product": productId,
    isActive: true,
  }).populate("user items.product");
};

cartSchema.statics.getMostAddedProducts = function (limit = 10) {
  return this.aggregate([
    { $match: { isActive: true } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        totalQuantity: { $sum: "$items.quantity" },
        cartCount: { $sum: 1 },
      },
    },
    { $sort: { cartCount: -1, totalQuantity: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
  ]);
};

cartSchema.pre("save", function (next) {
  const seenProducts = new Set();
  this.items = this.items.filter((item) => {
    const productId = item.product.toString();
    if (seenProducts.has(productId)) {
      return false;
    }
    seenProducts.add(productId);
    return true;
  });

  next();
});

// Static methods yang sudah ada
cartSchema.statics.findByUser = function (userId) {
  return this.findOne({ user: userId, isActive: true });
};

cartSchema.statics.findBySession = function (sessionId) {
  return this.findOne({ sessionId: sessionId, isActive: true });
};

// Method tambahan untuk coupon - tanpa mengubah logic yang sudah ada
cartSchema.methods.calculateTotal = function () {
  return this.items.reduce((total, item) => {
    return total + item.priceAtAddition * item.quantity;
  }, 0);
};

cartSchema.methods.calculateFinalPrice = function () {
  const total = this.calculateTotal();
  const discount = this.appliedCoupon ? this.appliedCoupon.discountAmount : 0;
  return total - discount;
};

// Virtual untuk menghitung jumlah total item
cartSchema.virtual("totalItems").get(function () {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

cartSchema.set("toJSON", { virtuals: true });
cartSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Cart", cartSchema);
