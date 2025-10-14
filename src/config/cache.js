module.exports = {
  // Default TTL values (in seconds)
  defaultTTL: {
    products: 300, // 5 minutes
    categories: 1800, // 30 minutes  
    sellers: 600, // 10 minutes
    profiles: 900, // 15 minutes
    search: 180, // 3 minutes
  },
  
  // Cache size limits
  maxCacheSize: 1000, // Maximum number of keys
  maxMemorySize: 100 * 1024 * 1024, // 100MB in bytes
  
  // Cleanup interval
  cleanupInterval: 60000, // 1 minute
  
  // Environment specific settings
  development: {
    enabled: true,
    verbose: true,
  },
  
  production: {
    enabled: true,
    verbose: false,
  },
  
  test: {
    enabled: false,
    verbose: false,
  }
};

const logger = require("../utils/logger");

const initializeCache = () => {
  const { cache } = require('../middlewares/cache-middleware');
  logger.info("Initializing cache system...");

  // Warmup cache after DB connection
  setTimeout(async () => {
    try {
      await cache.warmup();
      logger.info("Cache system initialized and warmed up");
    } catch (error) {
      logger.error("Cache warmup failed:", error);
    }
  }, 2000);
};
module.exports = { initializeCache };