// controllers/product.controller.js - REFACTORED VERSION
const ProductService = require("../../services/user/product.service");
const asyncHandler = require("../../middlewares/asyncHandler");
const ResponseHelper = require("../../utils/response.helper");
const logger = require("../../utils/logger");
const { HTTP_STATUS } = require("../../constants/httpStatus");

class ProductController {
  // Constants for parameter validation
  static ALLOWED_QUERY_PARAMS = {
    getAllProducts: [
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
    ],
    getProductById: ["includeDeleted", "compact"],
    getProductBySlug: ["includeDeleted", "compact"],
  };

  /**
   * GET / - Get all products with advanced filtering and pagination
   */
  static getAllProducts = asyncHandler(async (req, res) => {
    // Validate query parameters
    const validationError = ProductController._validateQueryParams(
      req.query,
      ProductController.ALLOWED_QUERY_PARAMS.getAllProducts
    );

    if (validationError) {
      return ResponseHelper.badRequest(
        res,
        validationError.message,
        validationError.data
      );
    }

    logger.info(
      `📦 Getting products with filters: ${JSON.stringify(req.query)}`
    );

    // Get products from service
    const result = await ProductService.getAllProducts(req.query);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Products retrieved successfully",
      result
    );
  });
  /**
   * GET /:slug - Get product by slug (SEO-friendly URL)
   */
  static getProductBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // Validate slug parameter exists
    if (!slug) {
      return ResponseHelper.badRequest(res, "Slug parameter is required");
    }

    // Validate query parameters
    const validationError = ProductController._validateQueryParams(
      req.query,
      ProductController.ALLOWED_QUERY_PARAMS.getProductBySlug
    );

    if (validationError) {
      return ResponseHelper.badRequest(
        res,
        validationError.message,
        validationError.data
      );
    }

    logger.info(`🔍 Getting product by slug: ${slug}`);

    // Parse options from query
    const options = ProductController._parseProductOptions(req.query);

    // Get product from service
    const result = await ProductService.getProductBySlug(slug, options);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Product retrieved successfully",
      result
    );
  });

  /**
   * GET /:productId - Get single product by ID
   */
  static getProductById = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    // Validate query parameters
    const validationError = ProductController._validateQueryParams(
      req.query,
      ProductController.ALLOWED_QUERY_PARAMS.getProductById
    );

    if (validationError) {
      return ResponseHelper.badRequest(
        res,
        validationError.message,
        validationError.data
      );
    }

    logger.info(`🔍 Getting product by ID: ${productId}`);

    // Parse options from query
    const options = ProductController._parseProductOptions(req.query);

    // Get product from service
    const result = await ProductService.getProductById(productId, options);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Product retrieved successfully",
      result
    );
  });

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Validate query parameters against allowed list
   * @private
   * @param {Object} queryParams - Request query parameters
   * @param {Array} allowedParams - Array of allowed parameter names
   * @returns {Object|null} - Error object or null if valid
   */
  static _validateQueryParams(queryParams, allowedParams) {
    const queryKeys = Object.keys(queryParams);
    const invalidParams = queryKeys.filter(
      (key) => !allowedParams.includes(key)
    );

    if (invalidParams.length > 0) {
      return {
        message: `Invalid query parameters: ${invalidParams.join(", ")}`,
        data: {
          allowedParams,
          received: queryKeys,
          invalidParams,
        },
      };
    }

    return null;
  }

  /**
   * Parse product options from query parameters
   * @private
   * @param {Object} query - Request query object
   * @returns {Object} - Parsed options object
   */
  static _parseProductOptions(query) {
    const { includeDeleted, compact } = query;

    return {
      includeDeleted: includeDeleted === "true",
      compact: compact === "true",
    };
  }
  /**
   * GET /:productId/reviews - Get product reviews with pagination
   */
  static getProductReviews = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    // Validate productId parameter exists
    if (!productId) {
      return ResponseHelper.badRequest(res, "Product ID parameter is required");
    }

    // Validate query parameters for reviews endpoint
    const allowedParams = [
      "page",
      "limit",
      "sortBy",
      "sortOrder",
      "activeOnly",
    ];
    const validationError = ProductController._validateQueryParams(
      req.query,
      allowedParams
    );

    if (validationError) {
      return ResponseHelper.badRequest(
        res,
        validationError.message,
        validationError.data
      );
    }

    logger.info(`📝 Getting reviews for product: ${productId}`);

    // Get reviews from service
    const result = await ProductService.getProductReviews(productId, req.query);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Product reviews retrieved successfully",
      result
    );
  });
}

module.exports = ProductController;
