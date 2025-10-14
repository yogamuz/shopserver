// seller-product.controller.js - REFACTORED TO CLASS-BASED VERSION
const asyncHandler = require("../../middlewares/asyncHandler");
const SellerProfileService = require("../../services/seller/seller-profile.service");
const SellerProductService = require("../../services/seller/seller-product.service");
const ResponseHelper = require("../../utils/response.helper");
const ValidationHelper = require("../../utils/validation.helper");
const { HTTP_STATUS, MESSAGES } = require("../../constants/httpStatus");
// Import logger
const logger = require("../../utils/logger");

/**
 * Seller Product Controller
 * Handles HTTP requests for seller product operations
 */
class SellerProductController {
  /**
   * Create product for seller
   */
  static createProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;

    logger.info(`📦 Creating product for seller: ${userId}`);

    // Validate product data
    const validation = ValidationHelper.validateProductData(req.body);
    if (!validation.isValid) {
      logger.error(`❌ Validation failed:`, validation.errors); // CHANGED: from info to error
      logger.error(`📋 Failed validation data:`, req.body); // ADD: Log failed data
      return ResponseHelper.badRequest(res, "Validation failed", validation.errors);
    }
    logger.info(`✅ Validation passed:`, validation.data); // ADD: Log successful validatio

    // Get active seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile || sellerProfile.status !== "active") {
      logger.info(`❌ Profile validation failed:`, {
        exists: !!sellerProfile,
        status: sellerProfile?.status,
      });
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.ACTIVE_NOT_FOUND);
    }

    // Validate category
    const categoryDoc = await SellerProductService.validateCategory(validation.data.category);
    if (!categoryDoc) {
      return ResponseHelper.badRequest(res, MESSAGES.CATEGORY.INVALID_OR_INACTIVE);
    }

    // Create product
    const product = await SellerProductService.createProduct(sellerProfile._id, validation.data);

    logger.info(`✅ Product created: ${product.title}`);

    // Clean response structure
    const responseData = {
      store: {
        id: sellerProfile._id.toString(),
        name: sellerProfile.storeName,
        slug: sellerProfile.storeSlug,
        description: sellerProfile.description,
      },
      product: {
        ...product,
        imageWithAlt: SellerProductService.generateImageWithAlt(product.title, product.image),
      },
    };

    return ResponseHelper.created(res, MESSAGES.PRODUCT.CREATED, responseData);
  });

  /**
   * Get all products for seller
   */
  static getSellerProducts = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;

    // Validate query params
    const allowedParams = [
      "page",
      "limit",
      "sortBy",
      "sortOrder",
      "status",
      "category",
      "search",
      "minPrice",
      "maxPrice",
      "inStock",
    ];

    const queryKeys = Object.keys(req.query);
    const invalidParams = queryKeys.filter(key => !allowedParams.includes(key));

    if (invalidParams.length > 0) {
      return ResponseHelper.badRequest(res, `Invalid query parameters: ${invalidParams.join(", ")}`, {
        allowedParams,
        received: queryKeys,
      });
    }

    logger.info(`📋 Getting products for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get products
    const { products, pagination } = await SellerProductService.getSellerProducts(sellerProfile._id, req.query);

    // Clean response structure
    const responseData = {
      store: {
        id: sellerProfile._id.toString(),
        name: sellerProfile.storeName,
        slug: sellerProfile.storeSlug,
        description: sellerProfile.description,
      },
      products,
      pagination,
      appliedFilters: req.query,
    };

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Products retrieved successfully", responseData);
  });

  /**
   * Get single product for seller
   */
  static getSellerProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;

    logger.info(`🔍 Getting product ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get product
    const product = await SellerProductService.getSellerProduct(productId, sellerProfile._id);

    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    // Clean response structure
    const responseData = {
      store: {
        id: sellerProfile._id.toString(),
        name: sellerProfile.storeName,
        slug: sellerProfile.storeSlug,
        description: sellerProfile.description,
      },
      product,
    };

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Product retrieved successfully", responseData);
  });

  /**
   * Update product
   */
  static updateProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;
    const partialUpdates = req.body; // RENAMED: from updates to partialUpdates for clarity

    logger.info(`🔄 Partially updating product ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Validate category if being updated
    if (partialUpdates.category) {
      const categoryDoc = await SellerProductService.validateCategory(partialUpdates.category);
      if (!categoryDoc) {
        return ResponseHelper.badRequest(res, MESSAGES.CATEGORY.INVALID_OR_INACTIVE);
      }
    }

    // Update product with partial data
    const product = await SellerProductService.updateProduct(productId, sellerProfile._id, partialUpdates);
    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    logger.info(`✅ Product partially updated: ${product.title}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.PRODUCT.UPDATED, product);
  });

  /**
   * Update product status
   */
  static updateProductStatus = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;
    const { isActive } = req.body;

    logger.info(`🔄 Updating product status ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Update product status
    const product = await SellerProductService.updateProductStatus(productId, sellerProfile._id, isActive);

    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    const statusText = isActive ? MESSAGES.PRODUCT.ACTIVE : MESSAGES.PRODUCT.INACTIVE;
    const actionText = isActive ? MESSAGES.PRODUCT.ACTIVATED : MESSAGES.PRODUCT.DEACTIVATED;

    logger.info(`✅ Product status updated: ${product.title} - ${statusText}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, `Product ${actionText} successfully`, product);
  });

  /**
   * Delete product
   */
  static deleteProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;

    logger.info(`🗑️ Deleting product ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Delete product
    const product = await SellerProductService.deleteProduct(productId, sellerProfile._id);
    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    logger.info(`✅ Product deleted: ${product.title}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.PRODUCT.DELETED);
  });

  /**
   * Bulk update product status
   */
  static bulkUpdateProductStatus = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productIds, isActive } = req.body;

    if (!ValidationHelper.validateProductIds(productIds)) {
      return ResponseHelper.badRequest(res, MESSAGES.VALIDATION.PRODUCT_IDS_REQUIRED);
    }

    logger.info(`🔄 Bulk updating ${productIds.length} products for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Update products
    const result = await SellerProductService.bulkUpdateProductStatus(productIds, sellerProfile._id, isActive);

    const actionText = isActive ? MESSAGES.PRODUCT.ACTIVATED : MESSAGES.PRODUCT.DEACTIVATED;

    logger.info(`✅ Bulk updated ${result.modifiedCount} products`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, `${result.modifiedCount} products ${actionText} successfully`, {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  });

  /**
   * Bulk delete products
   */
  static bulkDeleteProducts = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productIds } = req.body;

    if (!ValidationHelper.validateProductIds(productIds)) {
      return ResponseHelper.badRequest(res, MESSAGES.VALIDATION.PRODUCT_IDS_REQUIRED);
    }

    logger.info(`🗑️ Bulk deleting ${productIds.length} products for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Delete products
    const result = await SellerProductService.bulkDeleteProducts(productIds, sellerProfile._id);

    logger.info(`✅ Bulk deleted ${result.deletedCount} products`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, `${result.deletedCount} products deleted successfully`, {
      deletedCount: result.deletedCount,
    });
  });

  /**
   * Upload product image
   */
  static uploadProductImage = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;

    logger.info(`📸 Uploading image for product ${productId}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Upload image
    const result = await SellerProductService.uploadProductImage(productId, sellerProfile._id, req.file);

    if (!result.success) {
      return ResponseHelper.badRequest(res, result.message);
    }

    logger.info(`✅ Product image uploaded: ${result.productTitle}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.PRODUCT.IMAGE_UPLOADED, {
      imageUrl: result.imageUrl,
      metadata: result.metadata,
    });
  });

  /**
   * Get dashboard stats
   */
  static getDashboardStats = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { period = "30d" } = req.query; // Tambahkan support untuk period

    logger.info(`📊 Getting dashboard stats for seller: ${userId}, period: ${period}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get dashboard stats dengan period
    const stats = await SellerProductService.getDashboardStats(sellerProfile._id, period);

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Dashboard stats retrieved successfully", stats);
  });

  /**
   * Get product statistics
   */
  static getProductStats = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { period = "30d" } = req.query;

    const validatedPeriod = ValidationHelper.validatePeriod(period);

    logger.info(`📈 Getting product stats for seller: ${userId}, period: ${validatedPeriod}`);

    // Get seller profile
    const sellerProfile = await SellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get product stats
    const stats = await SellerProductService.getProductStats(sellerProfile._id, validatedPeriod);

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Product stats retrieved successfully", stats);
  });

  /**
   * Get store products (public)
   */
  static getStoreProducts = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // Validasi query params - same as before
    const allowedParams = [
      "page",
      "limit",
      "sortBy",
      "sortOrder",
      "category",
      "search",
      "minPrice",
      "maxPrice",
      "inStock",
    ];

    const queryKeys = Object.keys(req.query);
    const invalidParams = queryKeys.filter(key => !allowedParams.includes(key));

    if (invalidParams.length > 0) {
      return ResponseHelper.badRequest(res, `Invalid query parameters: ${invalidParams.join(", ")}`, {
        allowedParams,
        received: queryKeys,
      });
    }

    logger.info(`🏪 Getting products for store: ${slug}`);

    const result = await SellerProductService.getStoreProductsWithMeta(slug, req.query);

    if (!result) {
      return ResponseHelper.notFound(res, MESSAGES.STORE.NOT_FOUND);
    }

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Store products retrieved successfully", result);
  });
}

module.exports = SellerProductController;
