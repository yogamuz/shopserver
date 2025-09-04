const ProductService = require('../services/product.service');
const asyncHandler = require('../middlewares/asyncHandler');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');

class ProductController {
  /**
   * GET / - Get all products with advanced filtering and pagination
   */
  static getAllProducts = asyncHandler(async (req, res) => {
    // Validasi query params yang diizinkan
    const allowedParams = [
      'category', 'page', 'limit', 'search', 'sortBy', 'sortOrder', 
      'minPrice', 'maxPrice', 'isActive', 'sellerId', 'rating',
      'inStock', 'featured'
    ];
    
    const queryKeys = Object.keys(req.query);
    const invalidParams = queryKeys.filter(key => !allowedParams.includes(key));
    
    if (invalidParams.length > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Invalid query parameters: ${invalidParams.join(', ')}`,
        allowedParams,
        received: queryKeys
      });
    }
    
    const result = await ProductService.getAllProducts(req.query);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  });

  /**
   * GET /:id - Get single product by ID
   */
  static getProductById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { includeDeleted } = req.query;
    
    const product = await ProductService.getProductById(id, { includeDeleted });
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      product
    });
  });

  /**
   * POST / - Create new product (Admin/Seller only)
   */
  static createProduct = asyncHandler(async (req, res) => {
    const product = await ProductService.createProduct(req.body, req.user);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      product,
      message: MESSAGES.PRODUCT.CREATED
    });
  });

  /**
   * PUT /:id - Update product (Admin/Seller only)
   */
  static updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await ProductService.updateProduct(id, req.body, req.user);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      product,
      message: MESSAGES.PRODUCT.UPDATED
    });
  });

  /**
   * DELETE /:id - Delete product (Admin/Seller only)
   */
  static deleteProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { hard } = req.query; // Support hard delete via query param
    
    await deleteProductService(id, req.user, { hardDelete: hard === 'true' });
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: hard === 'true' ? 'Product permanently deleted' : MESSAGES.PRODUCT.DELETED
    });
  });
}

module.exports = ProductController;