// cache/CacheManager.js
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time to live tracking
    this.hitCount = new Map(); // Cache hit statistics
    this.missCount = new Map(); // Cache miss statistics

    // Default TTL values (in seconds)
    this.defaultTTL = {
      products: 300, // 5 minutes
      // categories: 1800, // 30 minutes
      // sellers: 600, // 10 minutes
      profiles: 900, // 15 minutes
      search: 180, // 3 minutes
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  // Generate cache key
  generateKey(type, identifier, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join("|");

    return `${type}:${identifier}${paramString ? ":" + paramString : ""}`;
  }

  // Set cache with TTL
  set(key, value, ttlSeconds = null) {
    try {
      const now = Date.now();
      const ttl = ttlSeconds || this.getDefaultTTL(key);
      const expiryTime = now + ttl * 1000;

      this.cache.set(key, {
        value: JSON.parse(JSON.stringify(value)), // Deep clone
        createdAt: now,
        expiryTime: expiryTime,
        accessCount: 0,
      });

      this.ttl.set(key, expiryTime);

      return true;
    } catch (error) {
      console.error("Cache set error:", error);
      return false;
    }
  }

  // Get from cache
  get(key) {
    try {
      const now = Date.now();
      const item = this.cache.get(key);

      if (!item) {
        this.incrementMiss(key);
        return null;
      }

      // Check if expired
      if (item.expiryTime < now) {
        this.cache.delete(key);
        this.ttl.delete(key);
        this.incrementMiss(key);
        return null;
      }

      // Update access stats
      item.accessCount++;
      this.incrementHit(key);

      return JSON.parse(JSON.stringify(item.value)); // Deep clone
    } catch (error) {
      console.error("Cache get error:", error);
      this.incrementMiss(key);
      return null;
    }
  }

  // Delete specific cache
  delete(key) {
    const deleted = this.cache.delete(key);
    this.ttl.delete(key);
    return deleted;
  }

  // Clear all cache
  clear() {
    this.cache.clear();
    this.ttl.clear();
    this.hitCount.clear();
    this.missCount.clear();
  }

  // Clear cache by pattern
  clearByPattern(pattern) {
    const regex = new RegExp(pattern);
    let deletedCount = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.ttl.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // Invalidate related cache
  invalidateRelated(type, id) {
    const patterns = this.getInvalidationPatterns(type, id);
    let totalDeleted = 0;

    patterns.forEach(pattern => {
      totalDeleted += this.clearByPattern(pattern);
    });

    return totalDeleted;
  }

  // Get invalidation patterns
  getInvalidationPatterns(type, id) {
    const patterns = [];

    switch (type) {
      case "product":
        patterns.push(`products:`); // All product lists
        patterns.push(`product:${id}`); // Specific product
        patterns.push(`search:`); // All search results
        break;

      case "category":
        patterns.push(`categories:`);
        patterns.push(`category:${id}`);
        patterns.push(`products:`); // Products by category
        break;

      case "seller":
        patterns.push(`sellers:`);
        patterns.push(`seller:${id}`);
        patterns.push(`products:.*sellerId:${id}`);
        break;

      case "profile":
        patterns.push(`profile:${id}`);
        break;
    }

    return patterns;
  }

  // Get default TTL based on key type
  getDefaultTTL(key) {
    if (key.startsWith("products:")) return this.defaultTTL.products;
    if (key.startsWith("categories:")) return this.defaultTTL.categories;
    if (key.startsWith("sellers:")) return this.defaultTTL.sellers;
    if (key.startsWith("profile:")) return this.defaultTTL.profiles;
    if (key.startsWith("search:")) return this.defaultTTL.search;

    return this.defaultTTL.products; // Default fallback
  }

  // Statistics tracking
  incrementHit(key) {
    const type = key.split(":")[0];
    this.hitCount.set(type, (this.hitCount.get(type) || 0) + 1);
  }

  incrementMiss(key) {
    const type = key.split(":")[0];
    this.missCount.set(type, (this.missCount.get(type) || 0) + 1);
  }

  // Get cache statistics
  getStats() {
    const stats = {
      totalKeys: this.cache.size,
      memoryUsage: this.getMemoryUsage(),
      hitRates: {},
      keysByType: {},
      oldestEntry: null,
      newestEntry: null,
    };

    // Calculate hit rates
    const allTypes = new Set([...this.hitCount.keys(), ...this.missCount.keys()]);

    allTypes.forEach(type => {
      const hits = this.hitCount.get(type) || 0;
      const misses = this.missCount.get(type) || 0;
      const total = hits + misses;

      stats.hitRates[type] = {
        hits,
        misses,
        total,
        hitRate: total > 0 ? ((hits / total) * 100).toFixed(2) + "%" : "0%",
      };
    });

    // Count keys by type
    for (const key of this.cache.keys()) {
      const type = key.split(":")[0];
      stats.keysByType[type] = (stats.keysByType[type] || 0) + 1;
    }

    // Find oldest and newest entries
    let oldest = null,
      newest = null;
    for (const [key, item] of this.cache.entries()) {
      if (!oldest || item.createdAt < oldest.createdAt) {
        oldest = { key, createdAt: item.createdAt };
      }
      if (!newest || item.createdAt > newest.createdAt) {
        newest = { key, createdAt: item.createdAt };
      }
    }

    stats.oldestEntry = oldest;
    stats.newestEntry = newest;

    return stats;
  }

  // Estimate memory usage
  getMemoryUsage() {
    let totalSize = 0;

    for (const [key, item] of this.cache.entries()) {
      totalSize += JSON.stringify({ key, item }).length * 2; // Rough estimate
    }

    return {
      bytes: totalSize,
      kb: (totalSize / 1024).toFixed(2),
      mb: (totalSize / (1024 * 1024)).toFixed(2),
    };
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, expiryTime] of this.ttl.entries()) {
      if (expiryTime < now) {
        this.cache.delete(key);
        this.ttl.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // Start automatic cleanup interval
  startCleanupInterval() {
    setInterval(() => {
      const deleted = this.cleanup();
      if (deleted > 0) {
        console.log(`Cache cleanup: removed ${deleted} expired entries`);
      }
    }, 60000); // Cleanup every minute
  }

  // cache/CacheManager.js - GANTI method warmup ini

// Warmup cache with frequently accessed data
async warmup() {
  try {
    console.log('Starting cache warmup...');
    
    // Warmup categories (most static)
    const Category = require('../models/category.model');
    const categories = await Category.find({ isActive: true });
    this.set('categories:all', categories, this.defaultTTL.categories);
    
    // Warmup active sellers
    const SellerProfile = require('../models/seller-profile.model');
    const sellers = await SellerProfile.findActiveStores({ limit: 50 });
    this.set('sellers:active:limit:50', sellers, this.defaultTTL.sellers);
    
    // Warmup top products (page 1, default limit)
    const Product = require('../models/products.model');
    const products = await Product.find({ isActive: true, deletedAt: null })
      .limit(20)
      .populate('category', 'name description')
      .populate({
        path: 'sellerId',
        select: 'storeName storeSlug logo contact userId',
        populate: {
          path: 'userId',
          select: 'lastSeen isActive username email',
          model: 'User'
        }
      })
      .lean();
    

    
    // Transform products ke format yang sama seperti API response
    const transformedProducts = products.map(product => ({
      id: product._id.toString(),
      title: product.title,
      slug: product.slug,
      description: product.description,
      price: product.price,
      image: {
        url: product.image || null,
        alt: product.title,
      },
      category: product.category ? {
        id: product.category._id.toString(),
        name: product.category.name,
        description: product.category.description,
      } : null,
      seller: product.sellerId ? {
        id: product.sellerId._id.toString(),
        name: product.sellerId.storeName,
        storeSlug: product.sellerId.storeSlug,
        logo: product.sellerId.logo || null,
        contact: product.sellerId.contact,
      } : null,
      stock: product.stock || 0,
      rating: product.rating || 0,
      reviews: product.reviews || 0,
      isAvailable: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }));
    
    // Generate cache key untuk products default query
    const productsCacheKey = this.generateKey('products', 'filtered', {
      page: '1',
      limit: '20',
      category: undefined,
      categoryId: undefined,
      sellerId: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      search: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      rating: undefined,
      inStock: undefined,
    });
    
    this.set(productsCacheKey, {
      success: true,
      data: {
        products: transformedProducts,
        pagination: {
          currentPage: 1,
          totalPages: Math.ceil(transformedProducts.length / 20),
          totalItems: transformedProducts.length,
          itemsPerPage: 20,
        }
      },
      message: 'Products retrieved successfully',
      cached: false,
    }, this.defaultTTL.products);
    
    console.log('Cache warmup completed');
  } catch (error) {
    console.error('Cache warmup failed:', error);
    throw error;
  }
}
}

// Export the CacheManager class
module.exports = CacheManager;
