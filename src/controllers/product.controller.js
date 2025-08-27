// controllers/productController.js (Refactored)
const {
  getAllProductsService,
  getProductByIdService,
  createProductService,
  updateProductService,
  deleteProductService
} = require('../services/product.service');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');

// GET all products with category filtering and pagination
const getAllProducts = async (req, res, next) => {
  try {
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
    const product = await getProductByIdService(id);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      product
    });
  } catch (error) {
    // Handle CastError for invalid ObjectId
    if (error.name === 'CastError') {
      error.message = 'Invalid product ID';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
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
      error.message = 'Validation error';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = errors;
    }
    
    next(error);
  }
};

// UPDATE product (Admin/Seller only)
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await updateProductService(id, req.body);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      product,
      message: MESSAGES.PRODUCT.UPDATED
    });
  } catch (error) {
    // Handle specific error types
    if (error.name === 'CastError') {
      error.message = 'Invalid product ID';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      error.message = 'Validation error';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = errors;
    }
    
    next(error);
  }
};

// DELETE product (Admin only)
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    await deleteProductService(id);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.PRODUCT.DELETED
    });
  } catch (error) {
    // Handle CastError for invalid ObjectId
    if (error.name === 'CastError') {
      error.message = 'Invalid product ID';
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
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