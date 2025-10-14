// services/productService.js - REFACTORED VERSION
const Product = require("../../models/products.model");
const mongoose = require("mongoose");
const { HTTP_STATUS, MESSAGES } = require("../../constants/httpStatus");
const {
  buildSearchQuery,
  buildSortObject,
  calculatePagination,
  buildCategoryFilter,
  buildPriceFilter,
  validateQueryParams,
} = require("../../utils/query.util");
const logger = require("../../utils/logger");

class ProductService {
  // Constants for query validation
  static ALLOWED_PARAMS = [
    "category",
    "page",
    "limit",
    "search",
    "sortBy",
    "sortOrder",
    "minPrice",
    "maxPrice",
    "isActive",
    "rating",
    "inStock",
  ];

  static DEFAULT_PARAMS = {
    page: 1,
    limit: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
    isActive: true,
  };

  // TAMBAHKAN konstanta untuk limit
  static MAX_LIMIT = 50; // Maksimum 50 items per request
  static MIN_LIMIT = 1; // Minimum 1 item

  /**
   * OPTIMIZED: Get all products with single aggregation pipeline for category queries
   * @param {Object} params - Query parameters
   * @returns {Object} - Products data with pagination and filters
   */
  static async getAllProducts(params) {
    try {
      const validationResult = this._validateAndSanitizeParams(params);
      if (!validationResult.isValid) {
        const error = new Error("Invalid query parameters");
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        error.details = validationResult.errors;
        throw error;
      }

      const sanitizedParams = validationResult.sanitizedParams;

      // FIXED: Apply pagination limits
      const paginationParams = this._sanitizePaginationParams(sanitizedParams);
      const finalParams = { ...sanitizedParams, ...paginationParams };

      const queryResult = await this._buildProductQuery(finalParams);

      // CRITICAL FIX: Handle category not found case
      if (queryResult.categoryNotFound) {
        return this._buildEmptyResponse(finalParams);
      }

      const { page, limit, sortBy, sortOrder } = paginationParams; // Use sanitized params
      const { page: parsedPage, limit: parsedLimit, skip } = calculatePagination(page, limit);
      const sort = buildSortObject(sortBy, sortOrder);

      let products, total;

      // OPTIMIZATION: Use aggregation pipeline for category queries
      if (queryResult.useAggregation && queryResult.pipeline) {
        // Single aggregation pipeline for category-based queries
        const fullPipeline = [
          ...queryResult.pipeline,

          // Add real-time rating calculation
          {
            $lookup: {
              from: "reviews",
              let: { productId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$productId", "$$productId"] },
                    isActive: true,
                    deletedAt: null,
                  },
                },
                {
                  $group: {
                    _id: null,
                    avgRating: { $avg: "$rating" },
                    totalReviews: { $sum: 1 },
                  },
                },
              ],
              as: "reviewStats",
            },
          },

          // Add seller data
          {
            $lookup: {
              from: "sellerprofiles",
              localField: "sellerId",
              foreignField: "_id",
              as: "sellerData",
            },
          },

          // Update fields with real-time data
          {
            $addFields: {
              rating: {
                $cond: [
                  { $gt: [{ $size: "$reviewStats" }, 0] },
                  {
                    $round: [{ $arrayElemAt: ["$reviewStats.avgRating", 0] }, 1],
                  },
                  { $ifNull: ["$rating", 0] },
                ],
              },
              reviews: {
                $cond: [
                  { $gt: [{ $size: "$reviewStats" }, 0] },
                  { $arrayElemAt: ["$reviewStats.totalReviews", 0] },
                  { $ifNull: ["$reviews", 0] },
                ],
              },
              sellerId: { $arrayElemAt: ["$sellerData", 0] },
            },
          },

          // Sort results
          { $sort: sort },

          // Use facet for pagination + count in single query
          {
            $facet: {
              products: [{ $skip: skip }, { $limit: parsedLimit }],
              totalCount: [{ $count: "count" }],
            },
          },
        ];

        const [result] = await Product.aggregate(fullPipeline);
        products = result.products || [];
        total = result.totalCount[0]?.count || 0;
      } else if (queryResult.query) {
        // Standard query for non-category requests
        [products, total] = await Promise.all([
          this._findProducts(queryResult.query, sort, skip, parsedLimit),
          Product.countDocuments(queryResult.query),
        ]);
      } else {
        // Handle category not found
        return this._buildEmptyResponse(sanitizedParams);
      }

      const transformedProducts = this._transformProducts(products);

      const response = this._buildSuccessResponse(transformedProducts, total, parsedPage, parsedLimit, sanitizedParams);

      logger.info(`Products API: Found ${products.length}/${total} products`);
      return response;
    } catch (error) {
      logger.error(`Error in getAllProducts: ${error.message}`);
      throw error;
    }
  }
  /**
   * Get single product by ID with full details
   * @param {string} id - Product ID
   * @param {Object} options - Additional options
   * @returns {Object} - Product data with related info
   */
  static async getProductById(id, options = {}) {
    try {
      // Validate ObjectId format
      this._validateObjectId(id);

      const { includeDeleted = false, compact = false } = options;

      // Find product with explicit query to handle soft delete
      const product = await this._findProductById(id, includeDeleted);

      if (!product) {
        const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
        error.statusCode = HTTP_STATUS.NOT_FOUND;
        throw error;
      }

      // Get similar products if needed
      const similarProducts = await this._findSimilarProducts(product, compact);

      // Build and return response
      return this._buildProductDetailResponse(product, similarProducts, compact);
    } catch (error) {
      logger.error(`❌ Error in getProductById: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get single product by slug with full details (SEO-friendly)
   * @param {string} slug - Product slug
   * @param {Object} options - Additional options
   * @returns {Object} - Product data with related info
   */
  static async getProductBySlug(slug, options = {}) {
    try {
      // Validate slug format
      this._validateSlug(slug);

      const { includeDeleted = false, compact = false } = options;

      // Find product by slug using model method
      const product = await Product.findBySlug(slug.trim(), { includeDeleted });

      if (!product) {
        const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
        error.statusCode = HTTP_STATUS.NOT_FOUND;
        throw error;
      }

      // Get similar products if needed
      const similarProducts = await this._findSimilarProducts(product, compact);

      // Build and return response (same as getProductById)
      return this._buildProductDetailResponse(product, similarProducts, compact);
    } catch (error) {
      logger.error(`❌ Error in getProductBySlug: ${error.message}`);
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Validate and sanitize query parameters
   * @private
   */
  static _validateAndSanitizeParams(params) {
    return validateQueryParams(params, this.ALLOWED_PARAMS);
  }

  // TAMBAHKAN method ini setelah _validateAndSanitizeParams:

  /**
   * Sanitize pagination parameters with limits
   * @private
   * @param {Object} params - Query parameters
   * @returns {Object} Sanitized pagination params
   */
  static _sanitizePaginationParams(params) {
    const {
      page = this.DEFAULT_PARAMS.page,
      limit = this.DEFAULT_PARAMS.limit,
      sortBy = this.DEFAULT_PARAMS.sortBy,
      sortOrder = this.DEFAULT_PARAMS.sortOrder,
    } = params;

    // FIXED: Enforce pagination limits
    const sanitizedPage = Math.max(1, parseInt(page) || 1);
    const sanitizedLimit = Math.min(
      this.MAX_LIMIT,
      Math.max(this.MIN_LIMIT, parseInt(limit) || this.DEFAULT_PARAMS.limit)
    );

    // Validate sortBy - only allow specific fields
    const allowedSortFields = ["createdAt", "updatedAt", "title", "price", "stock", "rating", "reviews"];
    const sanitizedSortBy = allowedSortFields.includes(sortBy) ? sortBy : this.DEFAULT_PARAMS.sortBy;

    // Validate sortOrder
    const sanitizedSortOrder = ["asc", "desc"].includes(sortOrder) ? sortOrder : this.DEFAULT_PARAMS.sortOrder;

    return {
      page: sanitizedPage,
      limit: sanitizedLimit,
      sortBy: sanitizedSortBy,
      sortOrder: sanitizedSortOrder,
    };
  }

  /**
   * Build product query filters
   * @private
   */
  /**
   * OPTIMIZED: Build product query filters with single aggregation pipeline
   * @private
   */
  static async _buildProductQuery(params) {
    const { category, search, minPrice, maxPrice, isActive, rating, inStock } = { ...this.DEFAULT_PARAMS, ...params };

    // OPTIMIZATION: Use aggregation pipeline instead of separate queries
    if (category) {
      return this._buildCategoryAggregationPipeline(params);
    }

    // Base query for non-category requests
    let query = {
      isActive: isActive === true || isActive === "true",
      deletedAt: null,
    };

    // Price filter
    if (minPrice !== undefined) {
      query.price = { $gte: parseFloat(minPrice) };
    }
    if (maxPrice !== undefined) {
      query.price = { ...query.price, $lte: parseFloat(maxPrice) };
    }

    // Rating filter
    if (rating !== undefined) {
      query.rating = { $gte: parseFloat(rating) };
    }

    // Stock filter
    if (inStock === "true") {
      query.stock = { $gt: 0 };
    } else if (inStock === "false") {
      query.stock = { $eq: 0 };
    }

    // Search filter
    if (search && search.trim()) {
      query.$or = [{ title: new RegExp(search.trim(), "i") }, { description: new RegExp(search.trim(), "i") }];
    }

    return { query, useAggregation: false };
  }

  /**
   * CRITICAL FIX: Single aggregation pipeline for category-based queries
   * @private
   */
  static _buildCategoryAggregationPipeline(params) {
    const {
      category,
      search,
      minPrice,
      maxPrice,
      rating,
      inStock,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = params;

    const pipeline = [
      // Stage 1: Lookup category by name (single query)
      {
        $lookup: {
          from: "categories",
          let: { categoryName: category.toLowerCase() },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: [{ $toLower: "$name" }, "$$categoryName"] }, { $eq: ["$isActive", true] }],
                },
              },
            },
          ],
          as: "categoryMatch",
        },
      },

      // Stage 2: Match products with found category + base filters
      {
        $match: {
          $expr: {
            $and: [
              { $gt: [{ $size: "$categoryMatch" }, 0] },
              {
                $eq: ["$category", { $arrayElemAt: ["$categoryMatch._id", 0] }],
              },
            ],
          },
          isActive: true,
          deletedAt: { $in: [null, undefined] },
        },
      },

      // Stage 3: Add search filter if provided
      ...(search && search.trim()
        ? [
            {
              $match: {
                $or: [{ title: new RegExp(search.trim(), "i") }, { description: new RegExp(search.trim(), "i") }],
              },
            },
          ]
        : []),

      // Stage 4: Add price filters if provided
      ...(minPrice !== undefined || maxPrice !== undefined
        ? [
            {
              $match: {
                $and: [
                  ...(minPrice !== undefined ? [{ price: { $gte: parseFloat(minPrice) } }] : []),
                  ...(maxPrice !== undefined ? [{ price: { $lte: parseFloat(maxPrice) } }] : []),
                ],
              },
            },
          ]
        : []),

      // Stage 5: Add rating filter if provided
      ...(rating !== undefined
        ? [
            {
              $match: { rating: { $gte: parseFloat(rating) } },
            },
          ]
        : []),

      // Stage 6: Add stock filter if provided
      ...(inStock === "true" ? [{ $match: { stock: { $gt: 0 } } }] : []),
      ...(inStock === "false" ? [{ $match: { stock: { $eq: 0 } } }] : []),

      // Stage 7: Add category info back
      {
        $addFields: {
          category: { $arrayElemAt: ["$categoryMatch", 0] },
        },
      },

      // Stage 8: Remove temporary fields
      { $unset: "categoryMatch" },
    ];

    return { pipeline, useAggregation: true, category };
  }

  // 1. PERBAIKAN DI _findProducts - Pastikan tidak ada field override
  static async _findProducts(query, sort, skip, limit) {
    return await Product.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "reviews",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$productId", "$$productId"] },
                isActive: true,
                deletedAt: null,
              },
            },
            {
              $group: {
                _id: null,
                avgRating: {
                  $avg: {
                    $cond: [{ $ne: ["$rating", null] }, "$rating", null],
                  },
                },
                totalReviews: { $sum: 1 },
              },
            },
          ],
          as: "reviewStats",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      {
        $lookup: {
          from: "sellerprofiles",
          localField: "sellerId",
          foreignField: "_id",
          as: "sellerData",
        },
      },
      {
        $addFields: {
          // HANYA update rating dan reviews, PRESERVE semua field lain
          rating: {
            $cond: [
              { $gt: [{ $size: "$reviewStats" }, 0] },
              { $round: [{ $arrayElemAt: ["$reviewStats.avgRating", 0] }, 1] },
              { $ifNull: ["$rating", 0] }, // Preserve existing rating
            ],
          },
          reviews: {
            $cond: [
              { $gt: [{ $size: "$reviewStats" }, 0] },
              { $arrayElemAt: ["$reviewStats.totalReviews", 0] },
              { $ifNull: ["$reviews", 0] }, // Preserve existing reviews count
            ],
          },
          // Populate relations tapi jangan override field lain
          category: { $arrayElemAt: ["$categoryData", 0] },
          sellerId: { $arrayElemAt: ["$sellerData", 0] },
        },
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          // Remove temporary fields
          reviewStats: 0,
          categoryData: 0,
          sellerData: 0,
        },
      },
    ]);
  }

  /**
   * Transform products to clean format
   * @private
   */
  static _transformProducts(products) {
    return products.map(product => ({
      id: product._id.toString(),
      title: product.title,
      slug: product.slug,
      description: product.description,
      price: product.price,
      image: {
        url: product.image,
        alt: product.title,
      },
      category: product.category.name,
      seller: product.sellerId
        ? {
            id: product.sellerId._id.toString(),
            name: product.sellerId.storeName,
            logo: product.sellerId.logo || null,
          }
        : null,
      stock: product.stock,
      rating: product.rating || 0, // Data sudah ter-update melalui pre-save middleware
      reviews: product.reviews || 0, // Data sudah ter-update melalui pre-save middleware
      isAvailable: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }));
  }

  /**
   * Build empty response for category not found
   * @private
   */
  static _buildEmptyResponse(params) {
    const { page = 1, limit = 20, category, search } = params;

    return {
      products: [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: parseInt(limit),
        hasNext: false,
        hasPrev: false,
      },
      filters: {
        category,
        search: search || null,
        categoryNotFound: true,
        message: "Category not found or inactive",
      },
    };
  }

  /**
   * Build success response with pagination
   * @private
   */
  // GANTI method _buildSuccessResponse dengan ini:
  static _buildSuccessResponse(products, total, page, limit, params) {
    const { category, search, minPrice, maxPrice, rating, inStock } = params;

    return {
      products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
        // ADDED: Show limit sanitization info
        requestedLimit: parseInt(params.limit) || this.DEFAULT_PARAMS.limit,
        appliedLimit: limit,
        maxAllowedLimit: this.MAX_LIMIT,
      },
      filters: {
        category: category || null,
        search: search || null,
        priceRange: {
          min: minPrice ? parseFloat(minPrice) : null,
          max: maxPrice ? parseFloat(maxPrice) : null,
        },
        rating: rating ? parseFloat(rating) : null,
        inStock: inStock || null,
      },
    };
  }

  /**
   * Validate ObjectId format
   * @private
   */
  static _validateObjectId(id) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error(MESSAGES.PRODUCT.INVALID_ID);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }
  }

  /**
   * Validate slug format
   * @private
   */
  static _validateSlug(slug) {
    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      const error = new Error("Invalid slug format");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }
  }


/**
 * PERBAIKAN: _findProductById - Include lastSeen di nested populate
 * GANTI method yang sudah ada dengan ini
 * @private
 */
static async _findProductById(id, includeDeleted) {
  let query = { _id: id };

  if (!includeDeleted) {
    query.deletedAt = { $in: [null, undefined] };
  }

  const product = await Product.findOne(query)
    .setOptions({ includeDeleted })
    .populate("category", "name description")
    .populate({
      path: "sellerId",
      select: "storeName storeSlug logo contact userId",
      populate: {
        path: "userId",
        select: "lastSeen isActive username email", // ← TAMBAHKAN: lastSeen + username + email
        model: "User"
      }
    })
    .lean();

  return product;
}

  /**
   * Find similar products
   * @private
   */
  static async _findSimilarProducts(product, compact = false) {
    if (!product.category?._id) return [];

    try {
      const similarProducts = await Product.find({
        category: product.category._id,
        _id: { $ne: product._id },
        isActive: true,
        deletedAt: { $in: [null, undefined] },
      })
        .setOptions({ includeDeleted: false })
        .limit(5)
        .sort({ rating: -1, reviews: -1 })
        .populate("category", "name")
        .populate("sellerId", "storeName logo")
        .lean();

      return this._transformSimilarProducts(similarProducts);
    } catch (err) {
      logger.warn(`⚠️ Error fetching similar products: ${err.message}`);
      return [];
    }
  }

  /**
   * Transform similar products data
   * @private
   */
  static _transformSimilarProducts(products) {
    return products.map(item => ({
      id: item._id.toString(),
      title: item.title,
      slug: item.slug,
      price: item.price,
      image: item.image || {
        url: "",
        alt: item.title,
      },
      category: item.category?.name || "Beauty",
      seller: {
        name: item.sellerId?.storeName || "",
        logo: item.sellerId?.logo || null,
      },
      rating: item.rating || 0,
      reviews: item.reviews || 0,
      inStock: (item.stock || 0) > 0,
    }));
  }

  /**
   * Build product detail response
   * @private
   */
  static _buildProductDetailResponse(product, similarProducts, compact) {
    const transformedProduct = {
      id: product._id.toString(),
      title: product.title,
      slug: product.slug,
      description: product.description,
      price: product.price,
      image: {
        url: product.image,
        alt: product.title,
      },
      category: product.category.name,
      seller: product.sellerId
        ? {
            id: product.sellerId._id.toString(),
            name: product.sellerId.storeName,
            slug: product.sellerId.storeSlug,
            logo: product.sellerId.logo || null,
            lastSeen: product.sellerId.userId?.lastSeen || null,
          }
        : null,
      stock: product.stock || 0,
      rating: product.rating || 0,
      reviews: product.reviews || 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };

    // Return compact format if requested
    if (compact) {
      return {
        product: {
          id: transformedProduct.id,
          title: transformedProduct.title,
          price: transformedProduct.price,
          image: transformedProduct.image.url,
          category: transformedProduct.category,
          seller: transformedProduct.seller?.name,
          rating: transformedProduct.rating,
          reviews: transformedProduct.reviews,
          inStock: transformedProduct.stock > 0,
        },
        similar: similarProducts.map(item => ({
          id: item.id,
          title: item.title,
          price: item.price,
          image: item.image?.url || item.image || "",
          rating: item.rating,
        })),
      };
    }

    // Full response format
    const meta = {
      similarCount: similarProducts.length,
      hasMore: similarProducts.length >= 4,
      category: product.category?.name || "Beauty",
      seller: product.sellerId?.storeName || "",
    };

    return {
      product: transformedProduct,
      similar: similarProducts,
      meta,
    };
  }
  /**
   * Get product reviews with pagination and rating stats
   * @param {string} productId - Product ID
   * @param {Object} params - Query parameters
   * @returns {Object} - Reviews data with pagination and stats
   */
  static async getProductReviews(productId, params = {}) {
    try {
      // Validate ObjectId format
      this._validateObjectId(productId);

      // Check if product exists
      const product = await Product.findById(productId).lean();
      if (!product) {
        const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
        error.statusCode = HTTP_STATUS.NOT_FOUND;
        throw error;
      }

      const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc", activeOnly = true } = params;

      // Calculate pagination
      const { page: parsedPage, limit: parsedLimit, skip } = calculatePagination(page, limit);

      // Build sort object
      const sort = buildSortObject(sortBy, sortOrder);

      // Build query for reviews
      const query = {
        productId: new mongoose.Types.ObjectId(productId),
        deletedAt: null,
      };

      if (activeOnly === true || activeOnly === "true") {
        query.isActive = true;
      }

      // Get reviews and total count in parallel
      const [reviews, total, ratingStats] = await Promise.all([
        this._findProductReviews(query, sort, skip, parsedLimit),
        this._countProductReviews(query),
        this._getProductRatingStats(productId),
      ]);

      // Transform reviews data
      const transformedReviews = this._transformReviews(reviews);

      // Build response
      return this._buildReviewsResponse(transformedReviews, ratingStats, total, parsedPage, parsedLimit, product);
    } catch (error) {
      logger.error(`❌ Error in getProductReviews: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find product reviews with population
   * @private
   */
  static async _findProductReviews(query, sort, skip, limit) {
    const Review = require("../../models/review.model");

    return await Review.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({
        path: "userId",
        select: "username",
        populate: {
          path: "profile",
          select: "avatar",
        },
      })
      .lean();
  }

  /**
   * Count product reviews
   * @private
   */
  static async _countProductReviews(query) {
    const Review = require("../../models/review.model");
    return await Review.countDocuments(query);
  }

  /**
   * Get product rating statistics
   * @private
   */
  static async _getProductRatingStats(productId) {
    const Review = require("../../models/review.model");
    return await Review.getProductRatingStats(productId);
  }

  /**
   * Transform reviews to clean format
   * @private
   */
  static _transformReviews(reviews) {
    return reviews.map(review => {
      // Extract avatar URL from profile
      let avatarUrl = null;
      if (review.userId?.profile?.avatar) {
        const avatar = review.userId.profile.avatar;
        avatarUrl = typeof avatar === "string" ? avatar : avatar.url || null;
      }

      return {
        id: review._id.toString(),
        rating: review.rating,
        comment: review.comment,
        user: {
          id: review.userId._id.toString(),
          username: review.userId.username,
          avatar: avatarUrl, // ✅ Tambahkan avatar
        },
        isActive: review.isActive,
        isModerated: review.isModerated,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      };
    });
  }

  /**
   * Build reviews response with stats and pagination
   * @private
   */
  static _buildReviewsResponse(reviews, ratingStats, total, page, limit, product) {
    return {
      product: {
        id: product._id.toString(),
        title: product.title,
        slug: product.slug,
      },
      reviews,
      ratingStats: {
        averageRating: ratingStats.averageRating || 0,
        totalReviews: ratingStats.totalReviews || 0,
        totalRatings: ratingStats.totalRatings || 0,
        ratingBreakdown: ratingStats.ratingBreakdown || {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0,
        },
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }
}

module.exports = ProductService;
