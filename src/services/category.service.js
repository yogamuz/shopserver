// services/categoryService.js - REFACTORED TO CLASS-BASED VERSION
const Category = require('../models/category.model');
const Product = require('../models/products.model');
const { isValidObjectId, processCategoriesWithImages } = require('../utils/category.util');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');
const logger = require('../utils/logger');

class CategoryService {
  /**
   * Get all categories with optional filters and pagination
   * @param {Object} params - Query parameters
   * @param {Object} req - Express request object
   * @returns {Object} - Categories data with pagination
   */
  static async getAllCategories(params, req) {
    const { 
      page = 1, 
      limit = 50,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      withProducts = false
    } = params;
    
    // Build query object
    let query = { isActive: true };
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    let categories;
    
    if (withProducts === 'true') {
      // Use aggregation to get categories with product count
      categories = await Category.getCategoriesWithProductCount();
      categories = categories.slice(skip, skip + parseInt(limit));
    } else {
      // Simple category fetch
      categories = await Category.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();
    }
    
    // Process categories to include full image URLs
    const categoriesWithImages = processCategoriesWithImages(categories, req);
    
    // Get total count for pagination
    const total = await Category.countDocuments(query);
    
    // Log for debugging
    logger.info(`🔍 Categories API: Found ${categories.length}/${total} categories`);
    logger.info(`🔍 Query:`, { search, page, limit, withProducts });
    
    return {
      categories: categoriesWithImages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: skip + parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      },
      filters: {
        search: search || null
      }
    };
  }

  /**
   * Get single category by ID
   * @param {string} id - Category ID
   * @param {Object} params - Query parameters
   * @param {Object} req - Express request object
   * @returns {Object} - Category data
   */
  static async getCategoryById(id, params, req) {
    const { withProducts = false } = params;
    
    let category;
    
    if (withProducts === 'true') {
      category = await Category.findById(id).populate('products');
    } else {
      category = await Category.findById(id).lean();
    }
    
    if (!category) {
      const error = new Error(MESSAGES.CATEGORY.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    
    // Process category to include full image URL
    const categoryWithImage = processCategoriesWithImages(category, req);
    
    logger.info(`🔍 Single Category: Found category ${id}`);
    
    return categoryWithImage;
  }

  /**
   * Get products by category ID
   * @param {string} id - Category ID
   * @param {Object} params - Query parameters
   * @param {Object} req - Express request object
   * @returns {Object} - Products data with category info and pagination
   */
  static async getProductsByCategory(id, params, req) {
    // VALIDASI OBJECTID TERLEBIH DAHULU
    logger.info(`🔍 Checking category ID: ${id}`);
    logger.info(`🔍 ID Length: ${id.length}`);
    logger.info(`✅ Is Valid ObjectId: ${isValidObjectId(id)}`);
    
    if (!isValidObjectId(id)) {
      logger.info(`❌ Invalid ObjectId format: ${id}`);
      const error = new Error('Category ID must be a valid 24-character MongoDB ObjectId');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = 'INVALID_ID_FORMAT';
      throw error;
    }

    const { 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      search
    } = params;
    
    // Verify category exists
    logger.info(`🔍 Searching for category with ID: ${id}`);
    const category = await Category.findById(id);
    
    if (!category) {
      logger.info(`❌ Category not found: ${id}`);
      const error = new Error(`No category found with ID: ${id}`);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      error.code = 'CATEGORY_NOT_FOUND';
      throw error;
    }
    
    if (!category.isActive) {
      logger.info(`❌ Category inactive: ${id} - ${category.name}`);
      const error = new Error(`Category "${category.name}" is currently inactive`);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      error.code = 'CATEGORY_NOT_ACTIVE';
      throw error;
    }
    
    logger.info(`✅ Category found: ${category.name}`);
    
    // Build query for products
    let productQuery = { 
      category: id, 
      isActive: true 
    };
    
    // Price filters
    if (minPrice !== undefined) {
      productQuery.price = { $gte: parseFloat(minPrice) };
    }
    if (maxPrice !== undefined) {
      productQuery.price = { ...productQuery.price, $lte: parseFloat(maxPrice) };
    }
    
    // Search filter
    if (search) {
      productQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    logger.info(`🔍 Product query:`, productQuery);
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query
    const products = await Product.find(productQuery)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('category', 'name')
      .lean();
    
    // Get total count
    const total = await Product.countDocuments(productQuery);
    
    logger.info(`📦 Products by Category: Found ${products.length}/${total} products in category ${category.name}`);
    
    // Process category to include full image URL
    const categoryWithImage = processCategoriesWithImages(category, req);
    
    return {
      category: {
        id: categoryWithImage._id,
        name: categoryWithImage.name,
        description: categoryWithImage.description,
        image: categoryWithImage.image
      },
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: skip + parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      },
      filters: {
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        search: search || null
      }
    };
  }

  /**
   * Create new category
   * @param {Object} categoryData - Category data
   * @param {Object} req - Express request object
   * @returns {Object} - Created category
   */
  static async createCategory(categoryData, req) {
    const category = new Category(categoryData);
    await category.save();
    
    // Process category to include full image URL
    const categoryWithImage = processCategoriesWithImages(category, req);
    
    logger.info(`✅ Category created: ${category._id} - ${category.name}`);
    
    return categoryWithImage;
  }

  /**
   * Update category by ID
   * @param {string} id - Category ID
   * @param {Object} updateData - Update data
   * @param {Object} req - Express request object
   * @returns {Object} - Updated category
   */
  static async updateCategory(id, updateData, req) {
    const category = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!category) {
      const error = new Error(MESSAGES.CATEGORY.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    
    // Process category to include full image URL
    const categoryWithImage = processCategoriesWithImages(category, req);
    
    logger.info(`✅ Category updated: ${id} - ${category.name}`);
    
    return categoryWithImage;
  }

  /**
   * Delete category by ID
   * @param {string} id - Category ID
   * @returns {Object} - Deletion result
   */
  static async deleteCategory(id) {
    const category = await Category.findById(id);
    
    if (!category) {
      const error = new Error(MESSAGES.CATEGORY.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    
    // Check if category has products
    const productCount = await Product.countDocuments({ category: id });
    
    if (productCount > 0) {
      const error = new Error(`This category has ${productCount} product(s). Please remove or reassign products first.`);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = 'HAS_PRODUCTS';
      throw error;
    }
    
    await Category.findByIdAndDelete(id);
    
    logger.info(`🗑️ Category deleted: ${id} - ${category.name}`);
    
    return { deletedCategory: category.name };
  }
}

module.exports = CategoryService;