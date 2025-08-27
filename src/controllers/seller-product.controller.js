const asyncHandler = require("../middlewares/asyncHandler");
const sellerProfileService = require("../services/seller-profile.service");
const sellerProductService = require("../services/seller-product.service");
const ResponseHelper = require("../utils/response.helper");
const ValidationHelper = require("../utils/validation.helper");
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");

// Import logger
const logger = require("../utils/logger");

/**
 * Seller Product Controller
 * Handles HTTP requests for seller product operations
 */
class SellerProductController {
  /**
   * Create product for seller
   */
createProduct = asyncHandler(async (req, res) => {
  // FIX: Use _id instead of userId since req.user is the User object from authMiddleware
  const userId = req.user._id || req.user.id;
  const { title, description, price, category, stock, image } = req.body;

  logger.info(`📦 Creating product for seller: ${userId}`);

  // Validate product data using ValidationHelper
  const validation = ValidationHelper.validateProductData(req.body);
  if (!validation.isValid) {
    logger.info(`❌ Validation failed:`, validation.errors);
    return ResponseHelper.badRequest(res, 'Validation failed', validation.errors);
  }

  // Get active seller profile
  const sellerProfile = await sellerProfileService.findByUserId(userId);
  
  logger.info(`🔍 DEBUG - Seller Profile Found:`, !!sellerProfile);
  logger.info(`🔍 DEBUG - Profile Status:`, sellerProfile?.status);
  
  if (!sellerProfile || sellerProfile.status !== 'active') {
    logger.info(`❌ Profile validation failed:`, {
      exists: !!sellerProfile,
      status: sellerProfile?.status,
      isActive: sellerProfile?.status === 'active'
    });
    return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.ACTIVE_NOT_FOUND);
  }

  // Validate category
  const categoryDoc = await sellerProductService.validateCategory(validation.data.category);
  if (!categoryDoc) {
    return ResponseHelper.badRequest(res, MESSAGES.CATEGORY.INVALID_OR_INACTIVE);
  }

  // Create product using validated data
  const product = await sellerProductService.createProduct(sellerProfile._id, validation.data);

  logger.info(`✅ Product created: ${product.title} by ${sellerProfile.storeName}`);
  
  // Log image status
  if (product.imageWithAlt?.hasImage) {
    logger.info(`🖼️ Product has image: ${product.imageWithAlt.url}`);
  } else {
    logger.info(`🏷️ Product created with alt text fallback: ${product.imageWithAlt?.alt}`);
  }

  return ResponseHelper.created(res, MESSAGES.PRODUCT.CREATED, product);
});

  /**
   * Get all products for seller
   */
  getSellerProducts = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const queryOptions = req.query;

    logger.info(`📋 Getting products for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get products with pagination
    const { products, pagination } = await sellerProductService.getSellerProducts(
      sellerProfile._id, 
      queryOptions
    );

    const responseData = {
      store: {
        id: sellerProfile._id,
        storeName: sellerProfile.storeName,
        storeSlug: sellerProfile.storeSlug,
        description: sellerProfile.description,
        logo: sellerProfile.logo
      },
      products,
      pagination
    };

    return ResponseHelper.success(res, HTTP_STATUS.OK, 'Products retrieved successfully', responseData);
  });

  /**
   * Get single product for seller
   */
  getSellerProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;

    logger.info(`🔍 Getting product ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get product
    const product = await sellerProductService.getSellerProduct(productId, sellerProfile._id);
    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    return ResponseHelper.success(res, HTTP_STATUS.OK, 'Product retrieved successfully', product);
  });

  /**
   * Update product
   */
  updateProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;
    const updates = req.body;

    logger.info(`🔄 Updating product ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Validate category if being updated
    if (updates.category) {
      const categoryDoc = await sellerProductService.validateCategory(updates.category);
      if (!categoryDoc) {
        return ResponseHelper.badRequest(res, MESSAGES.CATEGORY.INVALID_OR_INACTIVE);
      }
    }

    // Update product
    const product = await sellerProductService.updateProduct(productId, sellerProfile._id, updates);
    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    logger.info(`✅ Product updated: ${product.title}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.PRODUCT.UPDATED, product);
  });

  /**
   * Update product status
   */
  updateProductStatus = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;
    const { isActive } = req.body;

    logger.info(`🔄 Updating product status ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Update product status
    const product = await sellerProductService.updateProductStatus(
      productId, 
      sellerProfile._id, 
      isActive
    );

    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    const statusText = isActive ? MESSAGES.PRODUCT.ACTIVE : MESSAGES.PRODUCT.INACTIVE;
    const actionText = isActive ? MESSAGES.PRODUCT.ACTIVATED : MESSAGES.PRODUCT.DEACTIVATED;

    logger.info(`✅ Product status updated: ${product.title} - ${statusText}`);

    return ResponseHelper.success(
      res, 
      HTTP_STATUS.OK, 
      `Product ${actionText} successfully`, 
      product
    );
  });

  /**
   * Delete product
   */
  deleteProduct = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;

    logger.info(`🗑️ Deleting product ${productId} for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Delete product
    const product = await sellerProductService.deleteProduct(productId, sellerProfile._id);
    if (!product) {
      return ResponseHelper.notFound(res, MESSAGES.PRODUCT.NOT_FOUND);
    }

    logger.info(`✅ Product deleted: ${product.title}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.PRODUCT.DELETED);
  });

  /**
   * Bulk update product status
   */
  bulkUpdateProductStatus = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productIds, isActive } = req.body;

    if (!ValidationHelper.validateProductIds(productIds)) {
      return ResponseHelper.badRequest(res, MESSAGES.VALIDATION.PRODUCT_IDS_REQUIRED);
    }

    logger.info(`🔄 Bulk updating ${productIds.length} products for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Update products
    const result = await sellerProductService.bulkUpdateProductStatus(
      productIds, 
      sellerProfile._id, 
      isActive
    );

    const actionText = isActive ? MESSAGES.PRODUCT.ACTIVATED : MESSAGES.PRODUCT.DEACTIVATED;

    logger.info(`✅ Bulk updated ${result.modifiedCount} products`);

    return ResponseHelper.success(
      res, 
      HTTP_STATUS.OK, 
      `${result.modifiedCount} products ${actionText} successfully`,
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    );
  });

  /**
   * Bulk delete products
   */
  bulkDeleteProducts = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productIds } = req.body;

    if (!ValidationHelper.validateProductIds(productIds)) {
      return ResponseHelper.badRequest(res, MESSAGES.VALIDATION.PRODUCT_IDS_REQUIRED);
    }

    logger.info(`🗑️ Bulk deleting ${productIds.length} products for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Delete products
    const result = await sellerProductService.bulkDeleteProducts(productIds, sellerProfile._id);

    logger.info(`✅ Bulk deleted ${result.deletedCount} products`);

    return ResponseHelper.success(
      res, 
      HTTP_STATUS.OK, 
      `${result.deletedCount} products deleted successfully`,
      { deletedCount: result.deletedCount }
    );
  });

  /**
   * Upload product image
   */
  uploadProductImage = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { productId } = req.params;

    logger.info(`📸 Uploading image for product ${productId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Upload image
    const result = await sellerProductService.uploadProductImage(
      productId, 
      sellerProfile._id, 
      req.file
    );

    if (!result.success) {
      return ResponseHelper.badRequest(res, result.message);
    }

    logger.info(`✅ Product image uploaded: ${result.productTitle}`);

    return ResponseHelper.success(
      res, 
      HTTP_STATUS.OK, 
      MESSAGES.PRODUCT.IMAGE_UPLOADED,
      {
        imageUrl: result.imageUrl,
        metadata: result.metadata
      }
    );
  });

  /**
   * Get dashboard stats
   */
  getDashboardStats = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;

    logger.info(`📊 Getting dashboard stats for seller: ${userId}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get dashboard stats
    const stats = await sellerProductService.getDashboardStats(sellerProfile._id);

    return ResponseHelper.success(res, HTTP_STATUS.OK, 'Dashboard stats retrieved successfully', stats);
  });

  /**
   * Get product statistics
   */
  getProductStats = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const { period = '30d' } = req.query;

    const validatedPeriod = ValidationHelper.validatePeriod(period);

    logger.info(`📈 Getting product stats for seller: ${userId}, period: ${validatedPeriod}`);

    // Get seller profile
    const sellerProfile = await sellerProfileService.findByUserId(userId);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // Get product stats
    const stats = await sellerProductService.getProductStats(sellerProfile._id, validatedPeriod);

    return ResponseHelper.success(res, HTTP_STATUS.OK, 'Product stats retrieved successfully', stats);
  });

  /**
   * Get store products (public)
   */
  getStoreProducts = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const queryOptions = req.query;

    logger.info(`🏪 Getting products for store: ${slug}`);

    // Get seller profile by slug
    const sellerProfile = await sellerProfileService.findBySlug(slug);
    if (!sellerProfile) {
      return ResponseHelper.notFound(res, MESSAGES.STORE.NOT_FOUND);
    }

    // Validate price range if provided
    const { minPrice, maxPrice } = queryOptions;
    if (!ValidationHelper.validatePriceRange(minPrice, maxPrice)) {
      return ResponseHelper.badRequest(res, 'Invalid price range');
    }

    // Get store products
    const { products, pagination } = await sellerProductService.getStoreProducts(
      sellerProfile._id, 
      queryOptions
    );

    const responseData = {
      products,
      pagination,
      seller: {
        id: sellerProfile._id,
        storeName: sellerProfile.storeName,
        storeSlug: sellerProfile.storeSlug
      }
    };

    return ResponseHelper.success(res, HTTP_STATUS.OK, 'Store products retrieved successfully', responseData);
  });
}

// Export controller methods
const controller = new SellerProductController();

module.exports = {
  createProduct: controller.createProduct,
  getSellerProducts: controller.getSellerProducts,
  getSellerProduct: controller.getSellerProduct,
  updateProduct: controller.updateProduct,
  updateProductStatus: controller.updateProductStatus,
  deleteProduct: controller.deleteProduct,
  bulkUpdateProductStatus: controller.bulkUpdateProductStatus,
  bulkDeleteProducts: controller.bulkDeleteProducts,
  uploadProductImage: controller.uploadProductImage,
  getDashboardStats: controller.getDashboardStats,
  getProductStats: controller.getProductStats,
  getStoreProducts: controller.getStoreProducts
};