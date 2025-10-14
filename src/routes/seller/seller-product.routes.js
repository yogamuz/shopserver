// routes/seller/seller-product.routes.js
const express = require("express");
const router = express.Router();
const SellerProductController = require("../../controllers/seller/seller-product.controller");
const { roleMiddleware } = require("../../middlewares/role.middleware");
const {upload} = require("../../middlewares/upload.middleware");
const { invalidateAllProductCache } = require("../../middlewares/cache-middleware");

// BULK OPERATIONS - TARUH DI ATAS
router
  .route("/bulk/status")
  .patch(
    roleMiddleware(['seller']), 
    invalidateAllProductCache, // Invalidate all product cache
    SellerProductController.bulkUpdateProductStatus
  );

router
  .route("/bulk")
  .delete(
    roleMiddleware(['seller']), 
    invalidateAllProductCache, // Invalidate all product cache
    SellerProductController.bulkDeleteProducts
  );

// PRODUCT CRUD ROUTES - Chaining Style with cache invalidation
router
  .route("/")
  .post(
    roleMiddleware(['seller']), 
    invalidateAllProductCache,
    SellerProductController.createProduct
  )
  .get(roleMiddleware(['seller']), SellerProductController.getSellerProducts);

router
  .route("/:productId")
  .get(roleMiddleware(['seller']), SellerProductController.getSellerProduct)
  .patch(
    roleMiddleware(['seller']), 
    invalidateAllProductCache,
    SellerProductController.updateProduct
  )
  .delete(
    roleMiddleware(['seller']), 
    invalidateAllProductCache,
    SellerProductController.deleteProduct
  );

router
  .route("/:productId/status")
  .patch(
    roleMiddleware(['seller']), 
    invalidateAllProductCache,
    SellerProductController.updateProductStatus
  );

// PRODUCT IMAGE ROUTES - Chaining Style
router
  .route("/:productId/images")
  .post(
    roleMiddleware(['seller']), 
    upload.single('image'),
    invalidateAllProductCache,
    SellerProductController.uploadProductImage
  );

module.exports = router;