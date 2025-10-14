// Import CacheManager class
const CacheManager = require("./CacheManager");
const logger = require("../utils/logger");
// Create global cache instance
const cache = new CacheManager();

// Generic cache middleware
const cacheMiddleware = (keyGenerator, ttl = null, condition = null) => {
  return async (req, res, next) => {
    try {
      // Check condition if provided
      if (condition && !condition(req)) {
        return next();
      }

      // Generate cache key
      const cacheKey = typeof keyGenerator === "function" ? keyGenerator(req) : keyGenerator;

      // Try to get from cache
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData.data || cachedData,
          message: cachedData.message || "Data retrieved successfully",
          cached: true,
          timestamp: new Date().toISOString(),
        });
      }

      // Store original res.json
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function (data) {
        // Only cache successful responses
        if (data.success !== false && res.statusCode < 400) {
          cache.set(cacheKey, data, ttl);
        }

        // Add cache info to response
        if (typeof data === "object") {
          data.cached = false;
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error("Cache middleware error:", error);
      next();
    }
  };
};

const productCache = cacheMiddleware(
  req => {
    const {
      category, // TAMBAHKAN category dari query param
      categoryId,
      sellerId,
      page = 1,
      limit = 10,
      sortBy,
      sortOrder,
      search,
      minPrice,
      maxPrice,
      rating,
      inStock,
    } = req.query;

    // Prioritaskan category dari query param, fallback ke categoryId
    const categoryIdentifier = category || categoryId;

    const params = {
      category: categoryIdentifier, // GUNAKAN category sebagai key utama
      categoryId,
      sellerId,
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      minPrice,
      maxPrice,
      rating,
      inStock,
    };

    // Buat cache key yang lebih spesifik berdasarkan endpoint
    const endpoint = req.route?.path || req.path;
    if (endpoint.includes("/categories/") && req.params.categorySlug) {
      // Untuk endpoint /api/categories/:slug/products
      return cache.generateKey("category", req.params.categorySlug, "products", params);
    } else {
      // Untuk endpoint /api/products dengan query category
      return cache.generateKey("products", "filtered", params);
    }
  },
  300, // 5 minutes
  req => req.method === "GET"
);

// Tambahan: Cache khusus untuk category products endpoint
const categoryProductCache = cacheMiddleware(
  req => {
    const { page = 1, limit = 10, sortBy, sortOrder, search, minPrice, maxPrice, rating, inStock } = req.query;

    const categorySlug = req.params.categorySlug || req.params.slug;

    const params = {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      minPrice,
      maxPrice,
      rating,
      inStock,
    };

    // Cache key spesifik untuk category
    return cache.generateKey("category", categorySlug, "products", params);
  },
  300, // 5 minutes
  req => req.method === "GET"
);

const productDetailCache = cacheMiddleware(req => {
  // Prioritaskan slug dulu, baru id untuk backward compatibility
  const identifier = req.params.slug || req.params.productId || req.params.id;
  return cache.generateKey("product", identifier);
}, 300);

// const sellerCache = cacheMiddleware(
//   (req) => {
//     const { page = 1, limit = 10, search, city } = req.query;
//     const params = { page, limit, search, city };
//     return cache.generateKey("sellers", "list", params);
//   },
//   600 // 10 minutes
// );

// const sellerDetailCache = cacheMiddleware(
//   (req) => cache.generateKey("seller", req.params.id || req.params.slug),
//   600
// );

const profileCache = cacheMiddleware(
  req => cache.generateKey("profile", req.user?.id || req.params.userId),
  900, // 15 minutes
  req => req.method === "GET"
);

const sellerProfileCache = cacheMiddleware(
  req => {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return null;
    return cache.generateKey("sellerProfile", userId.toString());
  },
  300, // 5 menit (lebih pendek karena sering update)
  req => req.method === "GET"
);
// / Update search cache juga
const searchCache = cacheMiddleware(
  req => {
    const {
      q,
      category,
      sellerId,
      page = 1,
      limit = 10,
      sortBy,
      sortOrder,
      minPrice,
      maxPrice,
      rating,
      inStock,
    } = req.query;

    const params = {
      q,
      category, // Pastikan category disertakan
      sellerId,
      page,
      limit,
      sortBy,
      sortOrder,
      minPrice,
      maxPrice,
      rating,
      inStock,
    };

    return cache.generateKey("search", "results", params);
  },
  180 // 3 minutes
);

const invalidateProfileCache = (req, res, next) => {
  try {
    const originalJson = res.json;
    res.json = function (data) {
      if (data.success !== false && res.statusCode < 400) {
        const userId = req.user?._id || req.user?.id;
        if (userId) {
          // Clear both user & seller profile cache
          cache.delete(cache.generateKey("profile", userId));
          cache.delete(cache.generateKey("sellerProfile", userId));
        }
      }
      return originalJson.call(this, data);
    };
    next();
  } catch (error) {
    next();
  }
};


// Invalidate seller/store cache when profile changes
const invalidateStoreCache = (req, res, next) => {
  try {
    const originalJson = res.json;

    res.json = function (data) {
      if (data.success !== false && res.statusCode < 400) {
        try {
          // Get seller ID from user or from updated data
          const userId = req.user?._id || req.user?.id;
          
          if (userId) {
            // Clear seller profile cache patterns
            const sellerProfileDeleted = cache.clearByPattern(`seller:profile:*`);
            const sellerProductsDeleted = cache.clearByPattern(`seller:products:*`);
            const sellersListDeleted = cache.clearByPattern(`sellers:list:*`);
            const sellerProfileKeyDeleted = cache.clearByPattern(`sellerProfile:${userId}*`);

            const totalDeleted = sellerProfileDeleted + sellerProductsDeleted + sellersListDeleted + sellerProfileKeyDeleted;
            
            logger.info(`Store cache invalidated for seller ${userId}, deleted ${totalDeleted} entries`);
          }
        } catch (error) {
          logger.error("Store cache invalidation error:", error);
        }
      }
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error("Cache middleware setup error:", error);
    next();
  }
};
const invalidateSellerProductCache = (req, res, next) => {
  try {
    const originalJson = res.json;

    res.json = function (data) {
      if (data.success !== false && res.statusCode < 400) {
        try {
          // Clear semua product cache patterns karena ada perubahan status seller
          const productsListDeleted = cache.clearByPattern(`products:*`);
          const searchResultsDeleted = cache.clearByPattern(`search:*`);
          const categoryProductsDeleted = cache.clearByPattern(`category:*:products:*`);
          
          const totalDeleted = productsListDeleted + searchResultsDeleted + categoryProductsDeleted;
          
          logger.info(`Seller product cache invalidated, deleted ${totalDeleted} entries`);
        } catch (error) {
          logger.error("Seller product cache invalidation error:", error);
        }
      }
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error("Cache middleware setup error:", error);
    next();
  }
};


// Solution 2: Fix the original invalidateCache to work both ways
const createInvalidateCache = (type = null, getIdFromReq = null) => {
  return (req, res, next) => {
    try {
      const originalJson = res.json;

      res.json = function (data) {
        if (data.success !== false && res.statusCode < 400) {
          try {
            if (type && getIdFromReq) {
              // Original way for other routes
              const id = getIdFromReq(req);
              if (id) {
                const deletedCount = cache.invalidateRelated(type, id);
                logger.log(`Cache invalidated for ${type}:${id}, deleted ${deletedCount} entries`);
              }
            } else {
              // Default for profile routes
              if (req.user && req.user._id) {
                const profileKey = cache.generateKey("profile", req.user._id);
                cache.delete(profileKey);
                logger.log(`Profile cache invalidated for user: ${req.user._id}`);
              }
            }
          } catch (error) {
            logger.error("Cache invalidation error:", error);
          }
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error("Cache middleware setup error:", error);
      next();
    }
  };
};

const invalidateAllProductCache = (req, res, next) => {
  try {
    const originalJson = res.json;

    res.json = function (data) {
      if (data.success !== false && res.statusCode < 400) {
        try {
          // Clear all product-related cache patterns
          const productListDeleted = cache.clearByPattern("products:*");
          const productDetailDeleted = cache.clearByPattern("product:*");
          const searchDeleted = cache.clearByPattern("search:*");

          const totalDeleted = productListDeleted + productDetailDeleted + searchDeleted;
        } catch (error) {
          logger.error("❌ Product cache invalidation error:", error);
        }
      }
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error("❌ Cache middleware setup error:", error);
    next();
  }
};

// Cache management routes
const cacheRoutes = require("express").Router();

// Get cache statistics
cacheRoutes.get("/stats", (req, res) => {
  try {
    const stats = cache.getStats();
    res.json({
      success: true,
      data: stats,
      message: "Cache statistics retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get cache statistics",
      error: error.message,
    });
  }
});

// Clear all cache
cacheRoutes.delete("/clear", (req, res) => {
  try {
    cache.clear();
    res.json({
      success: true,
      message: "All cache cleared successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to clear cache",
      error: error.message,
    });
  }
});

// Clear cache by pattern
cacheRoutes.delete("/clear/:pattern", (req, res) => {
  try {
    const { pattern } = req.params;
    const deletedCount = cache.clearByPattern(pattern);

    res.json({
      success: true,
      message: `Cache cleared for pattern: ${pattern}`,
      deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to clear cache by pattern",
      error: error.message,
    });
  }
});

// Invalidate specific type
cacheRoutes.delete("/invalidate/:type/:id", (req, res) => {
  try {
    const { type, id } = req.params;
    const deletedCount = cache.invalidateRelated(type, id);

    res.json({
      success: true,
      message: `Cache invalidated for ${type}:${id}`,
      deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to invalidate cache",
      error: error.message,
    });
  }
});

// Manual warmup
cacheRoutes.post("/warmup", async (req, res) => {
  try {
    await cache.warmup();
    res.json({
      success: true,
      message: "Cache warmup completed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Cache warmup failed",
      error: error.message,
    });
  }
});

// Export updated cache middleware
module.exports = {
  cache,
  cacheMiddleware,
  productCache,
  productDetailCache,
  categoryProductCache,
  profileCache,
  sellerProfileCache,
  searchCache,
  invalidateCache: createInvalidateCache, // Updated version
  invalidateProfileCache, // Specific for profile routes
  invalidateAllProductCache,
  invalidateStoreCache,
  invalidateSellerProductCache,
  cacheRoutes,
};
