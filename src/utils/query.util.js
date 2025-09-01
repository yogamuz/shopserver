// utils/queryUtils.js (Complete Enhanced Version)

/**
 * Build search query for text fields with fuzzy matching
 * @param {string} search - Search term
 * @param {Array} fields - Array of field names to search in
 * @returns {Object} - MongoDB search query
 */
const buildSearchQuery = (search, fields) => {
  if (!search || !fields || fields.length === 0) return {};
  
  // Sanitize search term
  const sanitizedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  return {
    $or: fields.map(field => ({
      [field]: { $regex: sanitizedSearch, $options: 'i' }
    }))
  };
};

/**
 * Build sort object from sort parameters with validation
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - Sort order 'asc' or 'desc'
 * @returns {Object} - MongoDB sort object
 */
const buildSortObject = (sortBy = 'createdAt', sortOrder = 'desc') => {
  // Allowed sort fields to prevent injection
  const allowedSortFields = [
    'createdAt', 'updatedAt', 'title', 'price', 'name', 'rating', 
    'reviews', 'stock', 'featured'
  ];
  
  const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';
  
  const sort = {};
  sort[validSortBy] = validSortOrder === 'desc' ? -1 : 1;
  
  // Add secondary sort for consistent results
  if (validSortBy !== 'createdAt') {
    sort.createdAt = -1;
  }
  
  return sort;
};

/**
 * Calculate pagination values with limits
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination calculation result
 */
const calculatePagination = (page = 1, limit = 20) => {
  const parsedPage = Math.max(1, parseInt(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20)); // Max 100 items per page
  const skip = (parsedPage - 1) * parsedLimit;
  
  return {
    page: parsedPage,
    limit: parsedLimit,
    skip
  };
};

/**
 * Build comprehensive pagination response object
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination response object
 */
const buildPaginationResponse = (total, page, limit) => {
  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);
  const skip = (parsedPage - 1) * parsedLimit;
  const totalPages = Math.ceil(total / parsedLimit);
  
  return {
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages,
    hasNext: skip + parsedLimit < total,
    hasPrev: parsedPage > 1,
    hasFirst: parsedPage > 1,
    hasLast: parsedPage < totalPages,
    startIndex: skip + 1,
    endIndex: Math.min(skip + parsedLimit, total)
  };
};

/**
 * Build category filter query (Enhanced for name and ObjectId support)
 * @param {string} category - Category ID, name, or 'all'
 * @returns {Object} - Category filter object or error indicator
 */
const buildCategoryFilter = async (category) => {
  if (!category || category === 'all') return {};
  
  // Check if it's a valid ObjectId (24 hex characters)
  if (category.match(/^[0-9a-fA-F]{24}$/)) {
    // Verify ObjectId exists and is active
    const Category = require('../models/category.model');
    const categoryExists = await Category.findOne({ 
      _id: category, 
      isActive: true 
    }).lean();
    
    if (!categoryExists) {
      return { categoryNotFound: true };
    }
    
    return { category };
  } else {
    // Search by category name (case-insensitive)
    const Category = require('../models/category.model');
    
    try {
      const categoryDoc = await Category.findOne({ 
        name: { $regex: new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        isActive: true 
      }).lean();
      
      if (categoryDoc) {
        return { category: categoryDoc._id };
      } else {
        return { categoryNotFound: true };
      }
    } catch (error) {
      console.error('Error in buildCategoryFilter:', error);
      return { categoryNotFound: true };
    }
  }
};

/**
 * Build price filter query with validation
 * @param {number} minPrice - Minimum price
 * @param {number} maxPrice - Maximum price
 * @returns {Object} - Price filter object
 */
const buildPriceFilter = (minPrice, maxPrice) => {
  const priceFilter = {};
  
  if (minPrice !== undefined && !isNaN(parseFloat(minPrice)) && parseFloat(minPrice) >= 0) {
    priceFilter.$gte = parseFloat(minPrice);
  }
  
  if (maxPrice !== undefined && !isNaN(parseFloat(maxPrice)) && parseFloat(maxPrice) >= 0) {
    priceFilter.$lte = parseFloat(maxPrice);
  }
  
  // Validate price range
  if (priceFilter.$gte && priceFilter.$lte && priceFilter.$gte > priceFilter.$lte) {
    throw new Error('Minimum price cannot be greater than maximum price');
  }
  
  return Object.keys(priceFilter).length > 0 ? { price: priceFilter } : {};
};

/**
 * Build seller filter query
 * @param {string} sellerId - Seller ID
 * @returns {Object} - Seller filter object
 */
const buildSellerFilter = (sellerId) => {
  if (!sellerId) return {};
  
  // Validate if it's a valid ObjectId
  if (!sellerId.match(/^[0-9a-fA-F]{24}$/)) {
    return {};
  }
  
  return { sellerId };
};

/**
 * Build date range filter for timestamps
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string} field - Date field name
 * @returns {Object} - Date filter object
 */
const buildDateFilter = (startDate, endDate, field = 'createdAt') => {
  const dateFilter = {};
  
  if (startDate) {
    try {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        dateFilter.$gte = start;
      }
    } catch (error) {
      throw new Error(`Invalid start date format: ${startDate}`);
    }
  }
  
  if (endDate) {
    try {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        dateFilter.$lte = end;
      }
    } catch (error) {
      throw new Error(`Invalid end date format: ${endDate}`);
    }
  }
  
  // Validate date range
  if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) {
    throw new Error('Start date cannot be later than end date');
  }
  
  return Object.keys(dateFilter).length > 0 ? { [field]: dateFilter } : {};
};

/**
 * Validate and sanitize query parameters
 * @param {Object} params - Raw query parameters
 * @param {Array} allowedParams - Array of allowed parameter names
 * @returns {Object} - Validation result with sanitized params
 */
const validateQueryParams = (params, allowedParams) => {
  const errors = [];
  const sanitizedParams = {};
  
  // Check for completely invalid parameters
  const invalidParams = Object.keys(params).filter(key => !allowedParams.includes(key));
  if (invalidParams.length > 0) {
    errors.push(`Invalid parameters: ${invalidParams.join(', ')}`);
  }
  
  // Sanitize and validate each allowed parameter
  for (const [key, value] of Object.entries(params)) {
    if (!allowedParams.includes(key)) continue;
    
    switch (key) {
      case 'page':
      case 'limit':
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          errors.push(`${key} must be a positive integer`);
        } else {
          sanitizedParams[key] = key === 'limit' ? Math.min(100, num) : num;
        }
        break;
      
      case 'minPrice':
      case 'maxPrice':
      case 'rating':
        const floatVal = parseFloat(value);
        if (isNaN(floatVal) || floatVal < 0) {
          errors.push(`${key} must be a non-negative number`);
        } else {
          sanitizedParams[key] = floatVal;
        }
        break;
      
      case 'sortOrder':
        if (!['asc', 'desc'].includes(value)) {
          errors.push('sortOrder must be either "asc" or "desc"');
        } else {
          sanitizedParams[key] = value;
        }
        break;
      
      case 'sortBy':
        const allowedSortFields = ['createdAt', 'updatedAt', 'title', 'price', 'rating', 'stock'];
        if (!allowedSortFields.includes(value)) {
          errors.push(`sortBy must be one of: ${allowedSortFields.join(', ')}`);
        } else {
          sanitizedParams[key] = value;
        }
        break;
      
      case 'isActive':
      case 'inStock':
      case 'featured':
        if (!['true', 'false'].includes(value)) {
          errors.push(`${key} must be either "true" or "false"`);
        } else {
          sanitizedParams[key] = value === 'true';
        }
        break;
      
      case 'sellerId':
      case 'category':
        // Basic validation for ObjectId format if it looks like one
        if (value.match(/^[0-9a-fA-F]{24}$/) === null && value !== 'all') {
          // Allow category names and 'all', but validate ObjectId format
          if (key === 'sellerId') {
            errors.push('sellerId must be a valid 24-character ObjectId');
            break;
          }
        }
        sanitizedParams[key] = typeof value === 'string' ? value.trim() : value;
        break;
      
      default:
        // For other string parameters, trim whitespace and sanitize
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed.length > 0) {
            sanitizedParams[key] = trimmed;
          }
        } else {
          sanitizedParams[key] = value;
        }
    }
  }
  
  return {
    isValid: errors.length === 0,
    sanitizedParams,
    errors
  };
};

/**
 * Build aggregation pipeline for complex queries
 * @param {Object} filters - Filter object
 * @param {Object} options - Aggregation options
 * @returns {Array} - MongoDB aggregation pipeline
 */
const buildAggregationPipeline = (filters, options = {}) => {
  const { includeSellerInfo = false, includeCategoryInfo = true } = options;
  const pipeline = [];
  
  // Match stage with filters
  if (Object.keys(filters).length > 0) {
    pipeline.push({ $match: filters });
  }
  
  // Lookup stages
  if (includeCategoryInfo) {
    pipeline.push({
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    });
    pipeline.push({
      $unwind: {
        path: '$categoryInfo',
        preserveNullAndEmptyArrays: true
      }
    });
  }
  
  if (includeSellerInfo) {
    pipeline.push({
      $lookup: {
        from: 'sellerprofiles',
        localField: 'sellerId',
        foreignField: '_id',
        as: 'sellerInfo'
      }
    });
    pipeline.push({
      $unwind: {
        path: '$sellerInfo',
        preserveNullAndEmptyArrays: true
      }
    });
  }
  
  return pipeline;
};

module.exports = {
  buildSearchQuery,
  buildSortObject,
  calculatePagination,
  buildPaginationResponse,
  buildCategoryFilter,
  buildPriceFilter,
  buildSellerFilter,
  buildDateFilter,
  validateQueryParams,
  buildAggregationPipeline
};