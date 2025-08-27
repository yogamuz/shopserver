// categoryController.js (Refactored)
const {
  getAllCategoriesService,
  getCategoryByIdService,
  getProductsByCategoryService,
  createCategoryService,
  updateCategoryService,
  deleteCategoryService
} = require('../services/category.service');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');

// GET all categories with product count
const getAllCategories = async (req, res, next) => {
  try {
    const result = await getAllCategoriesService(req.query, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// GET single category by ID
const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await getCategoryByIdService(id, req.query, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      category
    });
  } catch (error) {
    next(error);
  }
};

// GET products by category ID
const getProductsByCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getProductsByCategoryService(id, req.query, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    // Handle specific error codes for better error messages
    if (error.code === 'INVALID_ID_FORMAT') {
      error.message = MESSAGES.CATEGORY.INVALID_ID_FORMAT;
      error.details = error.message;
    } else if (error.code === 'CATEGORY_NOT_FOUND') {
      error.message = MESSAGES.CATEGORY.NOT_FOUND;
      error.details = error.message;
    } else if (error.code === 'CATEGORY_NOT_ACTIVE') {
      error.message = MESSAGES.CATEGORY.NOT_ACTIVE;
      error.details = error.message;
    } else if (error.name === 'CastError') {
      error.message = MESSAGES.CATEGORY.INVALID_ID_FORMAT;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = error.message;
    }
    
    next(error);
  }
};

// CREATE new category (Admin only)
const createCategory = async (req, res, next) => {
  try {
    const category = await createCategoryService(req.body, req);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      category,
      message: MESSAGES.CATEGORY.CREATED
    });
  } catch (error) {
    // Handle specific error types
    if (error.code === 11000) {
      error.message = MESSAGES.CATEGORY.ALREADY_EXISTS;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      error.message = MESSAGES.CATEGORY.VALIDATION_ERROR;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = errors;
    }
    
    next(error);
  }
};

// UPDATE category (Admin only)
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await updateCategoryService(id, req.body, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      category,
      message: MESSAGES.CATEGORY.UPDATED
    });
  } catch (error) {
    // Handle specific error types
    if (error.name === 'CastError') {
      error.message = MESSAGES.CATEGORY.INVALID_ID;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.code === 11000) {
      error.message = MESSAGES.CATEGORY.ALREADY_EXISTS;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      error.message = MESSAGES.CATEGORY.VALIDATION_ERROR;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = errors;
    }
    
    next(error);
  }
};

// DELETE category (Admin only)
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    await deleteCategoryService(id);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CATEGORY.DELETED
    });
  } catch (error) {
    // Handle specific error types
    if (error.name === 'CastError') {
      error.message = MESSAGES.CATEGORY.INVALID_ID;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else if (error.code === 'HAS_PRODUCTS') {
      error.message = MESSAGES.CATEGORY.HAS_PRODUCTS;
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = error.message;
    }
    
    next(error);
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  getProductsByCategory,
  createCategory,
  updateCategory,
  deleteCategory
};