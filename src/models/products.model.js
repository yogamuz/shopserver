const mongoose = require("mongoose");

// Set default timezone to Jakarta/WIB for all Date operations
process.env.TZ = "Asia/Jakarta";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    // NEW: Slug field for SEO-friendly URLs
    slug: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      index: true,
      required: true,
    },
    image: {
      type: String,
      required: false, // Changed from true to false
      default: null,
    },
    stock: {
      type: Number,
      min: 0,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    reviews: {
      type: Number,
      default: 0,
    },
    // NEW: Seller reference field
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: false, // Optional to maintain backward compatibility
      index: true,
    },
    // NEW: Soft delete support with WIB timezone
    deletedAt: {
      type: Date,
      default: null,
      get: function (value) {
        return value
          ? new Date(
              value.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
            )
          : null;
      },
    },
  },
  {
    timestamps: {
      currentTime: () =>
        new Date(
          new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
        ),
    },
    toJSON: {
      getters: true,
      transform: function (doc, ret) {
        // Convert timestamps to WIB when serializing
        if (ret.createdAt) {
          ret.createdAt = new Date(
            ret.createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          );
        }
        if (ret.updatedAt) {
          ret.updatedAt = new Date(
            ret.updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          );
        }
        if (ret.deletedAt && !doc.includeDeleted) {
          delete ret.deletedAt;
        }
        return ret;
      },
    },
    toObject: {
      getters: true,
      transform: function (doc, ret) {
        // Convert timestamps to WIB when converting to object
        if (ret.createdAt) {
          ret.createdAt = new Date(
            ret.createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          );
        }
        if (ret.updatedAt) {
          ret.updatedAt = new Date(
            ret.updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          );
        }
        return ret;
      },
    },
  }
);

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

productSchema.virtual("carts", {
  ref: "Cart",
  localField: "_id",
  foreignField: "items.product",
  justOne: false,
});

// NEW: Virtual for seller info
productSchema.virtual("seller", {
  ref: "SellerProfile",
  localField: "sellerId",
  foreignField: "_id",
  justOne: true,
});

productSchema.virtual("imageWithAlt").get(function () {
  return {
    url: this.image || null,
    alt: this.title || "Product Image",
    hasImage: !!this.image,
  };
});

// Updated indexes to include sellerId
// Core indexes
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ category: 1, price: 1 });
productSchema.index({ category: 1, rating: -1 });

// Seller-specific indexes
productSchema.index({ sellerId: 1, category: 1 });
productSchema.index({ sellerId: 1, deletedAt: 1, createdAt: -1 }); // NEW: Untuk getProductStats

// Complex queries
productSchema.index({ category: 1, price: 1, isActive: 1, deletedAt: 1 });
productSchema.index({ isActive: 1, deletedAt: 1, rating: -1, createdAt: -1 });

productSchema.index({ 
  title: "text", 
  description: "text" 
}, {
  weights: { title: 10, description: 5 },
  name: "search_index"
});


productSchema.methods.getCategoryInfo = function () {
  return mongoose.model("Category").findById(this.category);
};

// Updated to consider seller context
productSchema.methods.getSimilarProducts = function (limit = 5) {
  const query = {
    category: this.category,
    _id: { $ne: this._id },
    isActive: true,
    deletedAt: null,
  };

  // If product has seller, prioritize same seller's products
  if (this.sellerId) {
    return mongoose.model("Product").aggregate([
      { $match: query },
      {
        $addFields: {
          sameSeller: {
            $cond: [{ $eq: ["$sellerId", this.sellerId] }, 1, 0],
          },
        },
      },
      { $sort: { sameSeller: -1, rating: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
    ]);
  }

  return mongoose
    .model("Product")
    .find(query)
    .limit(limit)
    .sort({ rating: -1 })
    .populate("category");
};

// NEW: Virtual for reviews
productSchema.virtual("reviewsList", {
  ref: "Review",
  localField: "_id",
  foreignField: "productId",
  justOne: false,
  match: { isActive: true, deletedAt: null },
});

// NEW: Method to get reviews with pagination
productSchema.methods.getReviews = function (options = {}) {
  const Review = mongoose.model("Review");
  return Review.getByProduct(this._id, options);
};

// NEW: Method to get rating statistics
productSchema.methods.getRatingStats = function () {
  const Review = mongoose.model("Review");
  return Review.getProductRatingStats(this._id);
};

// NEW: Method to check if user can review
productSchema.methods.canUserReview = function (userId) {
  const Review = mongoose.model("Review");
  return Review.checkUserCanReview(userId, this._id);
};

// NEW: Method to update rating dan reviews count dari Review collection
productSchema.methods.updateRatingFromReviews = async function () {
  const stats = await this.getRatingStats();
  this.rating = stats.averageRating;
  this.reviews = stats.totalReviews;
  return this.save();
};

// NEW: Get products by seller
productSchema.statics.getBySeller = function (sellerId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = -1,
    activeOnly = true,
    includeDeleted = false,
  } = options;

  const match = { sellerId: mongoose.Types.ObjectId(sellerId) };

  if (activeOnly) {
    match.isActive = true;
  }

  if (!includeDeleted) {
    match.deletedAt = null;
  }

  return this.find(match)
    .sort({ [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate("category")
    .populate("sellerId", "storeName storeSlug logo");
};

productSchema.statics.getByCategory = function (categoryId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = -1,
    minPrice,
    maxPrice,
    sellerId, // NEW: Optional seller filter
  } = options;

  const match = {
    category: mongoose.Types.ObjectId(categoryId),
    isActive: true,
    deletedAt: null,
  };

  if (minPrice !== undefined) match.price = { $gte: minPrice };
  if (maxPrice !== undefined) match.price = { ...match.price, $lte: maxPrice };
  if (sellerId) match.sellerId = mongoose.Types.ObjectId(sellerId);

  return this.find(match)
    .sort({ [sortBy]: sortOrder })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate("category")
    .populate("sellerId", "storeName storeSlug logo");
};

// NEW: Search products with seller context
// NEW: Search products with seller context - FIXED VERSION
productSchema.statics.searchProducts = function (searchTerm, options = {}) {
  const {
    page = 1,
    limit = 10,
    category,
    sellerId,
    minPrice,
    maxPrice,
    sortBy = "relevance",
  } = options;

  const match = {
    $and: [
      { isActive: true },
      { deletedAt: null },
      {
        $or: [
          { title: new RegExp(searchTerm, "i") },
          { description: new RegExp(searchTerm, "i") },
        ],
      },
    ],
  };

  if (category) match.category = mongoose.Types.ObjectId(category);
  if (sellerId) match.sellerId = mongoose.Types.ObjectId(sellerId);
  if (minPrice !== undefined) match.price = { $gte: minPrice };
  if (maxPrice !== undefined) match.price = { ...match.price, $lte: maxPrice };

  let sortCriteria;
  switch (sortBy) {
    case "price_asc":
      sortCriteria = { price: 1 };
      break;
    case "price_desc":
      sortCriteria = { price: -1 };
      break;
    case "rating":
      sortCriteria = { rating: -1, reviews: -1 };
      break;
    case "newest":
      sortCriteria = { createdAt: -1 };
      break;
    case "relevance":
    default:
      // Fixed: Don't use $meta textScore without text index
      sortCriteria = { rating: -1, createdAt: -1 };
  }

  return this.find(match)
    .sort(sortCriteria)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate("category")
    .populate("sellerId", "storeName storeSlug logo");
};

productSchema.statics.findBySlug = function (slug, options = {}) {
  const { includeDeleted = false } = options;

  const query = { slug };

  if (!includeDeleted) {
    query.deletedAt = { $in: [null, undefined] };
  }

  return this.findOne(query)
    .populate("category", "name description image")
    .populate({
      path: "sellerId",
      select: "storeName storeSlug logo contact userId",
      populate: {
        path: "userId",
        select: "lastSeen isActive username email",
        model: "User"
      }
    });
    // ← HAPUS .lean() di sini, populate harus sebelum lean
};

// NEW: Soft delete method with WIB timestamp
productSchema.methods.softDelete = function () {
  this.deletedAt = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  this.isActive = false;
  return this.save();
};

// NEW: Restore method
productSchema.methods.restore = function () {
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

productSchema.pre("save", async function (next) {
  // Generate slug if title is modified or this is a new document
  if (this.isModified("title") || this.isNew) {
    let baseSlug = generateSlug(this.title);
    let slug = baseSlug;
    let counter = 1;

    // Check if slug already exists and create unique one
    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }

  // Existing validation logic...
  if (this.isModified("category")) {
    const category = await mongoose.model("Category").findById(this.category);
    if (!category || !category.isActive) {
      const error = new Error("Category not found or inactive");
      error.code = "INVALID_CATEGORY";
      return next(error);
    }
  }

  // NEW: Validate seller if provided
  if (this.isModified("sellerId") && this.sellerId) {
    const seller = await mongoose
      .model("SellerProfile")
      .findById(this.sellerId);
    if (!seller || seller.deletedAt || seller.status !== "active") {
      const error = new Error("Seller profile not found or inactive");
      error.code = "INVALID_SELLER";
      return next(error);
    }
  }

  next();
});

// NEW: Pre-remove middleware for cascading deletes
productSchema.pre("remove", async function (next) {
  // Remove from carts when product is hard deleted
  try {
    await mongoose
      .model("Cart")
      .updateMany(
        { "items.product": this._id },
        { $pull: { items: { product: this._id } } }
      );
    next();
  } catch (error) {
    next(error);
  }
});

// NEW: Query middleware to exclude soft-deleted by default - FIXED VERSION
productSchema.pre(/^find/, function (next) {
  // Skip this middleware for populate queries or when explicitly disabled
  if (
    this.getQuery().skipSoftDeleteFilter ||
    this.getOptions().skipSoftDeleteFilter
  ) {
    return next();
  }

  // Don't apply to queries that explicitly include deleted items
  if (!this.getQuery().includeDeleted) {
    this.find({ deletedAt: { $in: [null, undefined] } });
  }
  next();
});

// Update transform functions untuk include imageWithAlt
productSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  transform: function (doc, ret, options) {
    // Create clean response object
    const cleanResponse = {
      id: ret._id,
      title: ret.title,
      slug: ret.slug,
      description: ret.description,
      price: ret.price,
      stock: ret.stock,
      isActive: ret.isActive,
      rating: ret.rating,
      reviews: ret.reviews,

      // Image information
      image: {
        url: ret.image || null,
        alt: ret.title || "Product Image",
        hasImage: !!ret.image,
      },

      // Category (if populated)
      category: ret.category
        ? typeof ret.category === "object" && ret.category._id
          ? {
              id: ret.category._id,
              name: ret.category.name,
              description: ret.category.description,
              slug: ret.category.slug,
              image: ret.category.image,
            }
          : ret.category
        : ret.category,

      // Seller (if populated)
      seller: ret.sellerId
        ? typeof ret.sellerId === "object" && ret.sellerId._id
          ? {
              id: ret.sellerId._id,
              storeName: ret.sellerId.storeName,
              storeSlug: ret.sellerId.storeSlug,
              logo: ret.sellerId.logo,
              contact: ret.sellerId.contact,
            }
          : ret.sellerId
        : ret.sellerId,

      // Timestamps in WIB
      createdAt: ret.createdAt
        ? new Date(
            ret.createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          )
        : null,
      updatedAt: ret.updatedAt
        ? new Date(
            ret.updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          )
        : null,
    };

    // Only include deletedAt if explicitly requested
    if (options && options.includeDeleted && ret.deletedAt) {
      cleanResponse.deletedAt = new Date(
        ret.deletedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
      );
    }

    return cleanResponse;
  },
});

productSchema.set("toObject", {
  virtuals: true,
  getters: true,
  transform: function (doc, ret) {
    // Convert timestamps to WIB when converting to object
    if (ret.createdAt) {
      ret.createdAt = new Date(
        ret.createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
      );
    }
    if (ret.updatedAt) {
      ret.updatedAt = new Date(
        ret.updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
      );
    }

    // Add imageWithAlt virtual field
    ret.imageWithAlt = {
      url: ret.image || null,
      alt: ret.title || "Product Image",
      hasImage: !!ret.image,
    };

    return ret;
  },
});

module.exports = mongoose.model("Product", productSchema);
