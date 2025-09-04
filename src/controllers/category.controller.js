// categoryController.js - REFACTORED TO CLASS-BASED VERSION
const CategoryService = require('../services/category.service');
const asyncHandler = require('../middlewares/asyncHandler');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');

class CategoryController {
  /**
   * GET / - Get all categories with product count
   */
  static getAllCategories = asyncHandler(async (req, res) => {
    const result = await CategoryService.getAllCategories(req.query, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  });

  /**
   * GET /:id - Get single category by ID
   */
  static getCategoryById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await CategoryService.getCategoryById(id, req.query, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      category
    });
  });

  /**
   * GET /:id/products - Get products by category ID
   */
  static getProductsByCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await CategoryService.getProductsByCategory(id, req.query, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  });

  /**
   * POST / - Create new category (Admin only)
   */
  static createCategory = asyncHandler(async (req, res) => {
    const category = await CategoryService.createCategory(req.body, req);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      category,
      message: MESSAGES.CATEGORY.CREATED
    });
  });

  /**
   * PUT /:id - Update category (Admin only)
   */
  static updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await CategoryService.updateCategory(id, req.body, req);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      category,
      message: MESSAGES.CATEGORY.UPDATED
    });
  });

  /**
   * DELETE /:id - Delete category (Admin only)
   */
  static deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await deleteCategoryService(id);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.CATEGORY.DELETED
    });
  });
}

module.exports = CategoryController;