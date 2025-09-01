// controllers/productController.js (Complete Enhanced Version)
const {
  getAllProductsService,
  getProductByIdService,
  createProductService,
  updateProductService,
  deleteProductService
} = require('../services/product.service');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');

// GET all products with advanced filtering and pagination
const getAllProducts = async (req, res, next) => {
  try {
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
    
    const result = await getAllProductsService(req.query);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// GET single product by ID
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { includeDeleted } = req.query;
    
    const product = await getProductByIdService(id, { includeDeleted });
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      product
    });
  } catch (error) {
    // Handle CastError for invalid ObjectId
    if (error.name === 'CastError') {
      error.message = 'Invalid product ID format';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = 'Product ID must be a valid 24-character MongoDB ObjectId';
    }
    
    next(error);
  }
};

// CREATE new product (Admin/Seller only)
const createProduct = async (req, res, next) => {
  try {
    const product = await createProductService(req.body, req.user);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      product,
      message: MESSAGES.PRODUCT.CREATED
    });
  } catch (error) {
    // Handle ValidationError
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      error.message = 'Product validation failed';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = errors;
    } else if (error.code === 11000) {
      // Handle duplicate key error
      error.message = 'Product with this title already exists';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.code === 'INVALID_CATEGORY') {
      error.message = 'Category not found or inactive';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.code === 'INVALID_SELLER') {
      error.message = 'Seller profile not found or inactive';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    
    next(error);
  }
};

// UPDATE product (Admin/Seller only)
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await updateProductService(id, req.body, req.user);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      product,
      message: MESSAGES.PRODUCT.UPDATED
    });
  } catch (error) {
    // Handle specific error types
    if (error.name === 'CastError') {
      error.message = 'Invalid product ID format';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = 'Product ID must be a valid 24-character MongoDB ObjectId';
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      error.message = 'Product validation failed';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = errors;
    } else if (error.code === 11000) {
      error.message = 'Product with this title already exists';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.code === 'INVALID_CATEGORY') {
      error.message = 'Category not found or inactive';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.code === 'INVALID_SELLER') {
      error.message = 'Seller profile not found or inactive';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    
    next(error);
  }
};

// DELETE product (Admin/Seller only)
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hard } = req.query; // Support hard delete via query param
    
    await deleteProductService(id, req.user, { hardDelete: hard === 'true' });
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: hard === 'true' ? 'Product permanently deleted' : MESSAGES.PRODUCT.DELETED
    });
  } catch (error) {
    // Handle CastError for invalid ObjectId
    if (error.name === 'CastError') {
      error.message = 'Invalid product ID format';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = 'Product ID must be a valid 24-character MongoDB ObjectId';
    }
    
    next(error);
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};