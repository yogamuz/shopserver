// services/productService.js - REFACTORED TO CLASS-BASED VERSION
const Product = require('../models/products.model');
const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');
const { 
  buildSearchQuery, 
  buildSortObject, 
  calculatePagination, 
  buildPaginationResponse,
  buildCategoryFilter,
  buildPriceFilter,
  buildSellerFilter,
  validateQueryParams
} = require('../utils/query.util');
const logger = require('../utils/logger');

class ProductService {
  /**
   * Get all products with advanced filtering, searching, and pagination
   * @param {Object} params - Query parameters
   * @returns {Object} - Products data with pagination and filters
   */
  static async getAllProducts(params) {
    // Define allowed parameters for validation
    const allowedParams = [
      'category', 'page', 'limit', 'search', 'sortBy', 'sortOrder', 
      'minPrice', 'maxPrice', 'isActive', 'sellerId', 'rating',
      'inStock', 'featured'
    ];
    
    // Validate query parameters
    const validation = validateQueryParams(params, allowedParams);
    if (!validation.isValid) {
      const error = new Error('Invalid query parameters');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = validation.errors;
      throw error;
    }
    
    const { 
      category, 
      page = 1, 
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      isActive = true,
      sellerId,
      rating,
      inStock,
      featured
    } = validation.sanitizedParams;
    
    // Build base query object
    let query = { 
      isActive: isActive === true || isActive === 'true',
      deletedAt: null // Exclude soft-deleted products
    };
    
    // Category filter - ENHANCED TO SUPPORT NAME AND OBJECTID
    const categoryFilter = await buildCategoryFilter(category);
    if (categoryFilter.categoryNotFound) {
      return {
        products: [],
        pagination: buildPaginationResponse(0, page, limit),
        filters: { 
          category, 
          search: search || null, 
          categoryNotFound: true,
          message: 'Category not found or inactive'
        }
      };
    }
    query = { ...query, ...categoryFilter };
    
    // Price filter
    const priceFilter = buildPriceFilter(minPrice, maxPrice);
    if (Object.keys(priceFilter).length > 0) {
      query = { ...query, ...priceFilter };
    }
    
    // Seller filter (simplified since we removed async from buildSellerFilter)
    const sellerFilter = buildSellerFilter(sellerId);
    if (Object.keys(sellerFilter).length > 0) {
      query = { ...query, ...sellerFilter };
    }
    
    // Rating filter
    if (rating !== undefined) {
      query.rating = { $gte: parseFloat(rating) };
    }
    
    // Stock filter
    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    } else if (inStock === 'false') {
      query.stock = { $eq: 0 };
    }
    
    // Featured filter (if you have featured field)
    if (featured === 'true') {
      query.featured = true;
    }
    
    // Search filter
    const searchQuery = buildSearchQuery(search, ['title', 'description']);
    if (Object.keys(searchQuery).length > 0) {
      query = { ...query, ...searchQuery };
    }
    
    // Calculate pagination
    const { page: parsedPage, limit: parsedLimit, skip } = calculatePagination(page, limit);
    
    // Build sort object
    const sort = buildSortObject(sortBy, sortOrder);
    
    // Execute query with population
    const products = await Product.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parsedLimit)
      .populate('category', 'name description image')
      .populate('sellerId', 'storeName storeSlug logo email') // Enhanced seller info
      .lean();
    
    // Get total count for pagination
    const total = await Product.countDocuments(query);
    
    // Log for debugging
    logger.info(`📦 Products API: Found ${products.length}/${total} products`);
    logger.info(`🔍 Applied Filters:`, { 
      category, search, minPrice, maxPrice, sellerId, rating, inStock, page, limit 
    });
    logger.info(`🔍 Final MongoDB Query:`, JSON.stringify(query, null, 2));
    
    return {
      products,
      pagination: buildPaginationResponse(total, parsedPage, parsedLimit),
      filters: {
        category: category || 'all',
        search: search || null,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        sellerId: sellerId || null,
        rating: rating ? parseFloat(rating) : null,
        inStock: inStock || null,
        isActive
      },
      summary: {
        totalProducts: total,
        currentPage: parsedPage,
        hasFilters: !!(category || search || minPrice || maxPrice || sellerId || rating || inStock)
      }
    };
  }

  /**
   * Get single product by ID with full details
   * @param {string} id - Product ID
   * @param {Object} options - Additional options
   * @returns {Object} - Product data with related info
   */
  static async getProductById(id, options = {}) {
    const { includeDeleted = false } = options;
    
    let query = Product.findById(id);
    
    // Include deleted products if requested
    if (includeDeleted) {
      query = query.setOptions({ includeDeleted: true });
    }
    
    const product = await query
      .populate('category', 'name description image')
      .populate('sellerId', 'storeName storeSlug logo email contactInfo')
      .lean();
    
    if (!product) {
      const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    
    // Get similar products (same category, exclude current)
    const similarProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isActive: true,
      deletedAt: null
    })
    .limit(4)
    .populate('category', 'name')
    .lean();
    
    logger.info(`📦 Single Product: Found product ${id} with ${similarProducts.length} similar products`);
    
    return {
      ...product,
      similarProducts
    };
  }

  /**
   * Create new product with seller assignment
   * @param {Object} productData - Product data
   * @param {Object} user - User object from req.user
   * @returns {Object} - Created product
   */
  static async createProduct(productData, user) {
    // Add user context
    if (user) {
      productData.createdBy = user.id;
      
      // If user is seller, assign sellerId
      if (user.role === 'seller') {
        productData.sellerId = user.sellerProfile || user.id;
      }
    }
    
    const product = new Product(productData);
    await product.save();
    
    // Populate for response
    await product.populate([
      { path: 'category', select: 'name description image' },
      { path: 'sellerId', select: 'storeName storeSlug logo' }
    ]);
    
    logger.info(`✅ Product created: ${product._id} - ${product.title} (by: ${user?.email || 'system'})`);
    
    return product;
  }

  /**
   * Update product with authorization check
   * @param {string} id - Product ID
   * @param {Object} updateData - Update data
   * @param {Object} user - User object from req.user
   * @returns {Object} - Updated product
   */
  static async updateProduct(id, updateData, user) {
    // First check if product exists and user has permission
    const existingProduct = await Product.findById(id);
    
    if (!existingProduct) {
      const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    
    // Authorization check: seller can only update their own products
    if (user.role === 'seller' && existingProduct.sellerId?.toString() !== user.id) {
      const error = new Error('You can only update your own products');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      throw error;
    }
    
    // Add update metadata
    updateData.updatedAt = new Date();
    if (user) {
      updateData.updatedBy = user.id;
    }
    
    const product = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'category', select: 'name description image' },
      { path: 'sellerId', select: 'storeName storeSlug logo' }
    ]);
    
    logger.info(`✅ Product updated: ${id} - ${product.title} (by: ${user?.email || 'system'})`);
    
    return product;
  }

  /**
   * Delete product (soft delete by default, hard delete for admin)
   * @param {string} id - Product ID
   * @param {Object} user - User object from req.user
   * @param {Object} options - Delete options
   * @returns {Object} - Deletion result
   */
  static async deleteProduct(id, user, options = {}) {
    const { hardDelete = false } = options;
    
    const product = await Product.findById(id);
    
    if (!product) {
      const error = new Error(MESSAGES.PRODUCT.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    
    // Authorization check: seller can only delete their own products
    if (user.role === 'seller' && product.sellerId?.toString() !== user.id) {
      const error = new Error('You can only delete your own products');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      throw error;
    }
    
    let deletionResult;
    
    if (hardDelete && user.role === 'admin') {
      // Hard delete (only admin)
      await Product.findByIdAndDelete(id);
      deletionResult = { type: 'hard', product: product.title };
      logger.info(`🗑️ Product HARD deleted: ${id} - ${product.title} (by: ${user?.email})`);
    } else {
      // Soft delete (default)
      await product.softDelete();
      deletionResult = { type: 'soft', product: product.title };
      logger.info(`🗑️ Product SOFT deleted: ${id} - ${product.title} (by: ${user?.email})`);
    }
    
    return deletionResult;
  }
}

module.exports = ProductService;