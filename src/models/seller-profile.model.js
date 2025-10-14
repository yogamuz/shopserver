const mongoose = require("mongoose");

const sellerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // ← This creates index automatically
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      validate: {
        validator: function(v){
           return /^[a-zA-Z0-9\s.\-']+$/.test(v.trim()) && 
             v.trim().length >= 2 && // minimum 2 characters
             !/^\s|\s$/.test(v) &&   // no leading/trailing spaces
             !/\s{2,}/.test(v);      // no multiple consecutive spaces
        },
        messsage: 'Store name can only contain letters, numbers, spaces, dots, dashes, and apostrophes. Minimum 2 characters.'
      }
    },
    storeSlug: {
      type: String,
      required: true,
      unique: true, // ← This creates index automatically
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    logo: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Logo must be a valid URL",
      },
    },
    banner: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Banner must be a valid URL",
      },
    },
    address: {
      street: String,
      city: String,
      province: String,
      postalCode: String,
      country: {
        type: String,
        default: "Indonesia",
      },
    },
    contact: {
      phone: {
        type: String,
        validate: {
          validator: function (v) {
            return !v || /^(\+62|0)[0-9]{8,13}$/.test(v);
          },
          message: "Phone number must be valid Indonesian format",
        },
      },
      email: {
        type: String,
        validate: {
          validator: function (v) {
            return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
          },
          message: "Email must be valid",
        },
      },
      socialLinks: [
        {
          platform: {
            type: String,
            enum: ["instagram", "facebook", "twitter", "whatsapp", "telegram"],
          },
          url: {
            type: String,
            validate: {
              validator: function (v) {
                return /^https?:\/\/.+/.test(v);
              },
              message: "Social link must be a valid URL",
            },
          },
        },
      ],
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deactivationReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual untuk mendapatkan products milik seller ini
sellerProfileSchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "sellerId",
  justOne: false,
});

// Virtual untuk menghitung total produk aktif
sellerProfileSchema.virtual("activeProductsCount", {
  ref: "Product",
  localField: "_id",
  foreignField: "sellerId",
  count: true,
  match: { isActive: true },
});

// Index untuk performa - REMOVED duplicates
// sellerProfileSchema.index({ userId: 1 }); ← REMOVED - sudah ada dari unique: true
// sellerProfileSchema.index({ storeSlug: 1 }); ← REMOVED - sudah ada dari unique: true
sellerProfileSchema.index({ status: 1 });
sellerProfileSchema.index({ isArchived: 1, status: 1 });
sellerProfileSchema.index({ "address.city": 1, status: 1 });

// Instance methods
sellerProfileSchema.methods.getActiveProducts = function (options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = -1,
  } = options;

  return mongoose
    .model("Product")
    .find({
      sellerId: this._id,
      isActive: true,
    })
    .sort({ [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate("category");
};

sellerProfileSchema.methods.getTotalProductsCount = function () {
  return mongoose.model("Product").countDocuments({
    sellerId: this._id,
  });
};

sellerProfileSchema.methods.getActiveProductsCount = function () {
  return mongoose.model("Product").countDocuments({
    sellerId: this._id,
    isActive: true,
  });
};

sellerProfileSchema.methods.archive = function () {
  this.status = "archived";
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

sellerProfileSchema.methods.restore = function () {
  this.status = "active";
  this.isArchived = false;
  this.archivedAt = null;
  return this.save();
};

sellerProfileSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  this.status = "inactive";
  return this.save();
};

// Update the findActiveStores static method in your SellerProfile model

sellerProfileSchema.statics.findActiveStores = function (options = {}) {
  const {
    page = 1,
    limit = 10,
    search,
    city,
    sortBy = "createdAt",
    sortOrder = -1,
  } = options;

  const match = {
    status: "active",
    isArchived: false,
    deletedAt: null,
  };

  if (search) {
    match.$or = [
      { storeName: new RegExp(search, "i") },
      { description: new RegExp(search, "i") },
    ];
  }

  if (city) {
    match["address.city"] = new RegExp(city, "i");
  }

  return this.aggregate([
    {
      $match: match,
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              email: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "products",
        let: { sellerId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$sellerId", "$$sellerId"] },
                  { $eq: ["$isActive", true] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalProducts: { $sum: 1 },
              totalReviews: { $sum: "$reviewCount" },
              avgRating: { $avg: "$rating" },
            },
          },
        ],
        as: "productStats",
      },
    },
    {
      $addFields: {
        owner: { $arrayElemAt: ["$owner", 0] },
        stats: {
          $let: {
            vars: {
              stats: { $arrayElemAt: ["$productStats", 0] },
            },
            in: {
              totalProducts: { $ifNull: ["$$stats.totalProducts", 0] },
              totalReviews: { $ifNull: ["$$stats.totalReviews", 0] },
              averageRating: {
                $round: [{ $ifNull: ["$$stats.avgRating", 0] }, 1],
              },
            },
          },
        },
        address: {
          street: "$address.street",
          city: "$address.city",
          province: "$address.province",
          postalCode: "$address.postalCode",
          country: "$address.country",
          fullAddress: {
            $concat: [
              { $ifNull: ["$address.street", ""] },
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$address.street", null] },
                      { $ne: ["$address.street", ""] },
                    ],
                  },
                  ", ",
                  "",
                ],
              },
              { $ifNull: ["$address.city", ""] },
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$address.city", null] },
                      { $ne: ["$address.city", ""] },
                      { $ne: ["$address.province", null] },
                      { $ne: ["$address.province", ""] },
                    ],
                  },
                  ", ",
                  "",
                ],
              },
              { $ifNull: ["$address.province", ""] },
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$address.province", null] },
                      { $ne: ["$address.province", ""] },
                      { $ne: ["$address.postalCode", null] },
                      { $ne: ["$address.postalCode", ""] },
                    ],
                  },
                  " ",
                  "",
                ],
              },
              { $ifNull: ["$address.postalCode", ""] },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        storeName: 1,
        storeSlug: 1,
        description: 1,
        status: 1,
        logo: 1,
        banner: 1,
        owner: {
          id: "$owner._id",
          username: "$owner.username",
        },
        address: 1,
        contact: 1,
        stats: 1,
        createdAt: 1,
        updatedAt: 1,
        // Remove sensitive fields
        // userId: 0,
        // isArchived: 0,
        // archivedAt: 0,
        // deletedAt: 0,
        // deactivationReason: 0
      },
    },
    {
      $sort: { [sortBy]: parseInt(sortOrder) },
    },
    {
      $skip: (page - 1) * limit,
    },
    {
      $limit: parseInt(limit),
    },
  ]);
};

sellerProfileSchema.statics.findBySlug = function (slug) {
  return this.findOne({
    storeSlug: slug,
    status: "active",
    isArchived: false,
    deletedAt: null,
  })
    .populate("userId", "username email createdAt")
    .populate({
      path: "products",
      match: { isActive: true },
      options: { sort: { rating: -1 } },
    });
};

// Pre-save middleware
sellerProfileSchema.pre("save", async function (next) {
  // Auto-generate slug jika belum ada
  if (!this.storeSlug && this.storeName) {
    const slugify = require("../utils/slugify");
    this.storeSlug = await slugify.createUniqueSlug(
      this.storeName,
      "SellerProfile"
    );
  }

  // Update status berdasarkan isArchived dan deletedAt
  if (this.deletedAt) {
    this.status = "inactive";
  } else if (this.isArchived) {
    this.status = "archived";
  }

  next();
});

// Pre-remove middleware untuk soft delete products
sellerProfileSchema.pre("remove", async function (next) {
  // Soft delete semua produk milik seller ini
  await mongoose
    .model("Product")
    .updateMany(
      { sellerId: this._id },
      { isActive: false, deletedAt: new Date() }
    );
  next();
});

// Transform output
sellerProfileSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    // Hapus field sensitif
    delete ret.deletedAt;
    return ret;
  },
});

sellerProfileSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("SellerProfile", sellerProfileSchema);
