// product.routes.js - UPDATED VERSION
const express = require("express");
const router = express.Router();
const ProductController = require("../../controllers/user/product.controller");
const { productCache, productDetailCache } = require('../../middlewares/cache-middleware');

// Public routes (NO AUTHENTICATION REQUIRED) with cache
router.get("/", productCache, ProductController.getAllProducts);

// Reviews route (must be before /:slug to avoid conflicts)
router.get("/:productId/reviews", ProductController.getProductReviews);

// Route untuk slug (priority lebih tinggi karena di atas)
router.get("/:slug", productDetailCache, (req, res, next) => {
  const { slug } = req.params;
  
  // Jika format ObjectId, redirect ke getProductById
  if (/^[0-9a-fA-F]{24}$/.test(slug)) {
    req.params.productId = slug;
    return ProductController.getProductById(req, res, next);
  }
  
  // Jika slug format, lanjut ke getProductBySlug
  return ProductController.getProductBySlug(req, res, next);
});

module.exports = router;
