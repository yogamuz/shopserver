// services/productService.js
const Product = require('../models/products.model');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');
const { 
  buildSearchQuery, 
  buildSortObject, 
  calculatePagination, 
  buildPaginationResponse,
  buildCategoryFilter 
} = require('../utils/query.util');
const logger = require('../utils/logger');

/**
 * Get all products with filtering, searching, and pagination
 * @param {Object} params - Query parameters
 * @returns {Object} - Products data with pagination
 */
const getAllProductsService = async (params) => {
  const { 
    category, 
    page = 1, 
    limit = 20,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = params;
  
  // Build query object
  let query = {};
  
  // Category filter
  const categoryFilter = buildCategoryFilter(category);
  query = { ...query, ...categoryFilter };
  
  // Search filter
  const searchQuery = buildSearchQuery(search, ['title', 'description']);
  if (Object.keys(searchQuery).length > 0) {
    query = { ...query, ...searchQuery };
  }
  
  // Calculate pagination
  const { page: parsedPage, limit: parsedLimit, skip } = calculatePagination(page, limit);
  
  // Build sort object
  const sort = buildSortObject(sortBy, sortOrder);
  
  // Execute query with pagination
  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parsedLimit)
    .lean(); // Use lean() for better performance
  
  // Get total count for pagination
  const total = await Product.countDocuments(query);
  
  // Log for debugging
  logger.info(`📦 Products API: Found ${products.length}/${total} products`);
  logger.info(`🔍 Query:`, { category, search, page, limit });
  
  return {
    products,
    pagination: buildPaginationResponse(total, parsedPage, parsedLimit),
    filters: {
      category: category || 'all',
      search: search || null
    }
  };
};

/**
 * Get single product by ID
 * @param {string} id - Product ID
 * @returns {Object} - Product data
 */
const getProductByIdService = async (id) => {
  const product = await Product.findById(id).lean();
  
  if (!product) {
    const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
    error.statusCode = HTTP_STATUS.NOT_FOUND;
    throw error;
  }
  
  logger.info(`📦 Single Product: Found product ${id}`);
  
  return product;
};

/**
 * Create new product
 * @param {Object} productData - Product data
 * @param {Object} user - User object from req.user
 * @returns {Object} - Created product
 */
const createProductService = async (productData, user) => {
  // Add user who created the product
  if (user) {
    productData.createdBy = user.id;
  }
  
  const product = new Product(productData);
  await product.save();
  
  logger.info(`✅ Product created: ${product._id}`);
  
  return product;
};

/**
 * Update product by ID
 * @param {string} id - Product ID
 * @param {Object} updateData - Update data
 * @returns {Object} - Updated product
 */
const updateProductService = async (id, updateData) => {
  // Add updated timestamp
  updateData.updatedAt = new Date();
  
  const product = await Product.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  );
  
  if (!product) {
    const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
    error.statusCode = HTTP_STATUS.NOT_FOUND;
    throw error;
  }
  
  logger.info(`✅ Product updated: ${id}`);
  
  return product;
};

/**
 * Delete product by ID
 * @param {string} id - Product ID
 * @returns {Object} - Deletion result
 */
const deleteProductService = async (id) => {
  const product = await Product.findByIdAndDelete(id);
  
  if (!product) {
    const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
    error.statusCode = HTTP_STATUS.NOT_FOUND;
    throw error;
  }
  
  logger.info(`🗑️ Product deleted: ${id}`);
  
  return { deletedProduct: product.title || product._id };
};

module.exports = {
  getAllProductsService,
  getProductByIdService,
  createProductService,
  updateProductService,
  deleteProductService
};