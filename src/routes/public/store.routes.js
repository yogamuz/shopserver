const express = require("express");
const router = express.Router();
const SellerProfileController = require('../../controllers/seller/seller-profile.controller');
const SellerProductController = require('../../controllers/seller/seller-product.controller');
const { cacheMiddleware } = require('../../middlewares/cache-middleware');

// Create specific cache middleware for store endpoints
const allStoresCache = cacheMiddleware(
  (req) => {
    const params = req.query;
    return `sellers:list:${JSON.stringify(params)}`;
  },
  600 // 10 minutes
);

const storeProfileCache = cacheMiddleware(
  (req) => {
    const slug = req.params.slug;
    return `seller:profile:${slug}`;
  },
  900 // 15 minutes - profile changes less frequently
);

const storeProductsCache = cacheMiddleware(
  (req) => {
    const slug = req.params.slug;
    const params = req.query;
    return `seller:products:${slug}:${JSON.stringify(params)}`;
  },
  300 // 5 minutes - products change more frequently
);

router.get("/", allStoresCache, SellerProfileController.getAllStores);
router.get("/:slug", storeProfileCache, SellerProfileController.getPublicProfile);
router.get("/:slug/products", storeProductsCache, SellerProductController.getStoreProducts);
router.get("/:slug/reviews/stats", SellerProfileController.getStoreReviewStats);
module.exports = router;