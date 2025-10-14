const mongoose = require("mongoose");

// Set default timezone to Jakarta/WIB for all Date operations
process.env.TZ = "Asia/Jakarta";

const reviewSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      required: false, // CHANGED: Rating is now optional
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
      validate: {
        validator: function (v) {
          // Allow null/undefined (optional) or valid numbers
          return v === null || v === undefined || Number.isInteger(v) || v % 0.5 === 0;
        },
        message: "Rating must be a whole number or half number (e.g., 1, 1.5, 2, etc.)",
      },
    },
    comment: {
      type: String,
      required: false, // KEEP THIS
      trim: true,
      minlength: [10, "Comment must be at least 10 characters"],
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    // Untuk mencegah duplikasi review dari user yang sama untuk produk yang sama
    isActive: {
      type: Boolean,
      default: true,
    },
    // Soft delete support with WIB timezone
    deletedAt: {
      type: Date,
      default: null,
      get: function (value) {
        return value ? new Date(value.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })) : null;
      },
    },
    // Untuk tracking apakah review sudah di-moderate
    isModerated: {
      type: Boolean,
      default: false,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      currentTime: () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })),
    },
    toJSON: {
      getters: true,
      transform: function (doc, ret) {
        // Convert timestamps to WIB when serializing
        if (ret.createdAt) {
          ret.createdAt = new Date(ret.createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
        }
        if (ret.updatedAt) {
          ret.updatedAt = new Date(ret.updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
        }
        return ret;
      },
    },
  }
);

// Indexes
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true }); // Prevent duplicate reviews
reviewSchema.index({ productId: 1, isActive: 1 });
reviewSchema.index({ userId: 1, isActive: 1 });
reviewSchema.index({ rating: -1 });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ deletedAt: 1 });

// Virtuals
reviewSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

reviewSchema.virtual("product", {
  ref: "Product",
  localField: "productId",
  foreignField: "_id",
  justOne: true,
});

// Instance Methods
reviewSchema.methods.softDelete = function () {
  this.deletedAt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  this.isActive = false;
  return this.save();
};

reviewSchema.methods.restore = function () {
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

reviewSchema.methods.moderate = function (moderatorId, approved = true) {
  this.isModerated = true;
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  this.isActive = approved;
  return this.save();
};

reviewSchema.statics.getByProduct = function (productId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = -1,
    activeOnly = true,
    includeDeleted = false,
  } = options;

  const match = { productId: new mongoose.Types.ObjectId(productId) };

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
    .populate("userId", "username")
    .populate("productId", "title slug");
};

reviewSchema.statics.getByUser = function (userId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = -1,
    activeOnly = true,
    includeDeleted = false,
  } = options;

  const match = { userId: new mongoose.Types.ObjectId(userId) };

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
    .populate("userId", "username")
    .populate("productId", "title slug image");
};
//UPDATED: Product rating calculation to handle null ratings
reviewSchema.statics.getProductRatingStats = async function (productId) {
  const result = await this.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        isActive: true,
        deletedAt: null,
        rating: { $ne: null }, // Only include reviews with ratings for average calculation
      },
    },
    {
      $group: {
        _id: "$productId",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 }, // This counts all active reviews
        totalRatings: {
          $sum: {
            $cond: [{ $ne: ["$rating", null] }, 1, 0],
          },
        }, // This counts only reviews with ratings
        ratingDistribution: {
          $push: "$rating",
        },
      },
    },
    {
      $addFields: {
        averageRating: { $round: ["$averageRating", 1] },
        ratingBreakdown: {
          5: {
            $size: {
              $filter: {
                input: "$ratingDistribution",
                cond: { $eq: ["$$this", 5] },
              },
            },
          },
          4: {
            $size: {
              $filter: {
                input: "$ratingDistribution",
                cond: { $eq: ["$$this", 4] },
              },
            },
          },
          3: {
            $size: {
              $filter: {
                input: "$ratingDistribution",
                cond: { $eq: ["$$this", 3] },
              },
            },
          },
          2: {
            $size: {
              $filter: {
                input: "$ratingDistribution",
                cond: { $eq: ["$$this", 2] },
              },
            },
          },
          1: {
            $size: {
              $filter: {
                input: "$ratingDistribution",
                cond: { $eq: ["$$this", 1] },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        averageRating: 1,
        totalReviews: 1,
        totalRatings: 1,
        ratingBreakdown: 1,
      },
    },
  ]);

  // UPDATED: Also get total reviews count including those without ratings
  const allReviewsCount = await this.countDocuments({
    productId: new mongoose.Types.ObjectId(productId),
    isActive: true,
    deletedAt: null,
  });

  const stats =
    result.length > 0
      ? result[0]
      : {
          averageRating: 0,
          totalRatings: 0,
          ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        };

  return {
    ...stats,
    totalReviews: allReviewsCount, // Total reviews including those without ratings
  };
};
reviewSchema.statics.createOrUpdateReview = async function(userId, productId, rating, comment) {
  // Validation: Prevent comment-only submission
  const hasValidComment = comment && comment.trim().length >= 10;
  const hasValidRating = rating && rating >= 1 && rating <= 5;
  
  if (hasValidComment && !hasValidRating) {
    const error = new Error("Cannot submit comment without a valid rating");
    error.statusCode = 400;
    throw error;
  }

  // If no valid data at all, skip silently
  if (!hasValidRating && !hasValidComment) {
    return null;
  }

  const existingReview = await this.findOne({
    userId: userId,
    productId: productId,
    deletedAt: null
  });
  
  if (existingReview) {
    const updates = {
      updatedAt: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
    };
    
    if (hasValidRating) {
      updates.rating = rating;
    }
    
    if (hasValidComment) {
      updates.comment = comment.trim().length > 1000 ? comment.substring(0, 1000) : comment.trim();
    }
    
    Object.assign(existingReview, updates);
    return await existingReview.save();
  }
  
  // Create new review
  const reviewData = { userId, productId };
  
  if (hasValidRating) {
    reviewData.rating = rating;
  }
  
  if (hasValidComment) {
    reviewData.comment = comment.trim().length > 1000 ? comment.substring(0, 1000) : comment.trim();
  }
  
  const newReview = new this(reviewData);
  return await newReview.save();
};

// Perbaikan untuk review.model.js - checkUserCanReview method
reviewSchema.statics.checkUserCanReview = async function (userId, productId) {
  const existingReview = await this.findOne({
    userId: userId, // Langsung pass sebagai string/ObjectId
    productId: productId, // Langsung pass sebagai string/ObjectId
    deletedAt: null,
  });

  return {
    canReview: true, // Always allow review (will update if exists)
    hasExistingReview: !!existingReview,
    existingReview: existingReview,
    isUpdate: !!existingReview,
  };
};

// Perbaikan untuk order.service.js - confirmDelivery method aggregate query
// Ganti bagian aggregate di confirmDelivery:

reviewSchema.statics.checkUserCanReview = async function (userId, productId) {
  const existingReview = await this.findOne({
    userId: userId, // Langsung pass sebagai string/ObjectId
    productId: productId, // Langsung pass sebagai string/ObjectId
    deletedAt: null,
  });

  return {
    canReview: true, // Always allow review (will update if exists)
    hasExistingReview: !!existingReview,
    existingReview: existingReview,
    isUpdate: !!existingReview,
  };
};

// Pre-save middleware
reviewSchema.pre("save", async function (next) {
  // Check if this is a new review or rating is modified
  if (this.isNew || this.isModified("rating") || this.isModified("isActive")) {
    try {
      // Update product rating and reviews count
      await this.updateProductStats();
    } catch (error) {
      console.error("Error updating product stats:", error);
      // Don't fail the save, just log the error
    }
  }
  next();
});

// Method to update product statistics
reviewSchema.methods.updateProductStats = async function () {
  const Product = mongoose.model("Product");
  const stats = await this.constructor.getProductRatingStats(this.productId);

  await Product.findByIdAndUpdate(this.productId, {
    rating: stats.averageRating,
    reviews: stats.totalReviews,
  });
};

// Post-remove middleware to update product stats
reviewSchema.post("remove", async function () {
  try {
    await this.updateProductStats();
  } catch (error) {
    console.error("Error updating product stats after review removal:", error);
  }
});

// Query middleware to exclude soft-deleted by default
reviewSchema.pre(/^find/, function (next) {
  // Skip this middleware for populate queries or when explicitly disabled
  if (this.getQuery().skipSoftDeleteFilter || this.getOptions().skipSoftDeleteFilter) {
    return next();
  }

  // Don't apply to queries that explicitly include deleted items
  if (!this.getQuery().includeDeleted) {
    this.find({ deletedAt: { $in: [null, undefined] } });
  }
  next();
});

// Transform output
reviewSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  transform: function (doc, ret) {
    // Create clean response object
    const cleanResponse = {
      id: ret._id,
      rating: ret.rating,
      comment: ret.comment,
      isActive: ret.isActive,
      isModerated: ret.isModerated,

      // User info (if populated)
      user: ret.userId
        ? typeof ret.userId === "object" && ret.userId._id
          ? {
              id: ret.userId._id,
              username: ret.userId.username,
            }
          : ret.userId
        : ret.userId,

      // Product info (if populated)
      product: ret.productId
        ? typeof ret.productId === "object" && ret.productId._id
          ? {
              id: ret.productId._id,
              title: ret.productId.title,
              slug: ret.productId.slug,
              image: ret.productId.image,
            }
          : ret.productId
        : ret.productId,

      // Timestamps in WIB
      createdAt: ret.createdAt ? new Date(ret.createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })) : null,
      updatedAt: ret.updatedAt ? new Date(ret.updatedAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })) : null,
    };

    return cleanResponse;
  },
});

module.exports = mongoose.model("Review", reviewSchema);
