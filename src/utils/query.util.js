// utils/queryUtils.js - OPTIMIZED VERSION

/**
 * Build search query for text fields with fuzzy matching
 * @param {string} search - Search term
 * @param {Array} fields - Array of field names to search in
 * @returns {Object} - MongoDB search query
 */
const buildSearchQuery = (search, fields = []) => {
  if (!search?.trim() || fields.length === 0) return {};
  
  // Sanitize and optimize search term
  const sanitizedSearch = search.trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, ' '); // Normalize whitespace
  
  // Use text index if available, otherwise regex
  return {
    $or: fields.map(field => ({
      [field]: { 
        $regex: sanitizedSearch, 
        $options: 'i' 
      }
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
  const ALLOWED_SORT_FIELDS = [
    'createdAt', 'updatedAt', 'title', 'price', 'name', 'rating', 
    'reviews', 'stock', 'featured'
  ];
  
  const ALLOWED_SORT_ORDERS = ['asc', 'desc'];
  
  const validSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  const validSortOrder = ALLOWED_SORT_ORDERS.includes(sortOrder) ? sortOrder : 'desc';
  
  const sort = {
    [validSortBy]: validSortOrder === 'desc' ? -1 : 1
  };
  
  // Add secondary sort for consistent results
  if (validSortBy !== 'createdAt') {
    sort.createdAt = -1;
  }
  
  return sort;
};

/**
 * Calculate pagination values with limits and validation
 * @param {number} page - Current page number
 * @param {number} limit - Items per page  
 * @returns {Object} - Pagination calculation result
 */
const calculatePagination = (page = 1, limit = 20) => {
  // Constants for pagination limits
  const MIN_PAGE = 1;
  const MIN_LIMIT = 1;
  const MAX_LIMIT = 100;
  const DEFAULT_LIMIT = 20;
  
  const parsedPage = Math.max(MIN_PAGE, parseInt(page) || MIN_PAGE);
  const parsedLimit = Math.min(
    MAX_LIMIT, 
    Math.max(MIN_LIMIT, parseInt(limit) || DEFAULT_LIMIT)
  );
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
  const parsedTotal = parseInt(total) || 0;
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 20;
  
  const skip = (parsedPage - 1) * parsedLimit;
  const totalPages = Math.ceil(parsedTotal / parsedLimit);
  
  return {
    total: parsedTotal,
    page: parsedPage,
    limit: parsedLimit,
    totalPages,
    hasNext: skip + parsedLimit < parsedTotal,
    hasPrev: parsedPage > 1,
    hasFirst: parsedPage > 1,
    hasLast: parsedPage < totalPages,
    startIndex: Math.min(skip + 1, parsedTotal),
    endIndex: Math.min(skip + parsedLimit, parsedTotal)
  };
};

/**
 * Build category filter query with caching support
 * @param {string} category - Category ID, name, or 'all'
 * @returns {Object} - Category filter object or error indicator
 */
const buildCategoryFilter = (() => {
  // Simple in-memory cache for category lookups
  const categoryCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  return async (category) => {
    if (!category || category === 'all') return { useAggregation: false };
    
    const cacheKey = category.toLowerCase();
    const now = Date.now();
    
    // Check cache first
    if (categoryCache.has(cacheKey)) {
      const cached = categoryCache.get(cacheKey);
      if (now - cached.timestamp < CACHE_TTL) {
        return cached.value;
      }
      categoryCache.delete(cacheKey);
    }
    
    let result;
    
    // Check if it's a valid ObjectId (24 hex characters)
    if (/^[0-9a-fA-F]{24}$/.test(category)) {
      result = await _handleCategoryByIdOptimized(category);
    } else {
      result = await _handleCategoryByNameOptimized(category);
    }
    
    // Cache the result
    categoryCache.set(cacheKey, {
      value: result,
      timestamp: now
    });
    
    return result;
  };
})();

/**
 * OPTIMIZED: Handle category by ObjectId - return direct filter
 * @private
 */
async function _handleCategoryByIdOptimized(categoryId) {
  try {
    const Category = require('../models/category.model');
    const categoryExists = await Category.findOne({ 
      _id: categoryId, 
      isActive: true 
    }).lean();
    
    return categoryExists 
      ? { category: categoryId, useAggregation: false }
      : { categoryNotFound: true, useAggregation: false };
  } catch (error) {
    console.error('Error in category lookup by ID:', error);
    return { categoryNotFound: true, useAggregation: false };
  }
}

/**
 * CRITICAL OPTIMIZATION: Return aggregation pipeline for category name lookup
 * This eliminates the double query pattern completely
 * @private
 */
async function _handleCategoryByNameOptimized(categoryName) {
  try {
    // Return aggregation pipeline instead of doing separate query
    return {
      useAggregation: true,
      categoryName: categoryName.toLowerCase(),
      pipeline: [
        // Stage 1: Lookup category by name in single aggregation
        {
          $lookup: {
            from: 'categories',
            let: { categoryName: categoryName.toLowerCase() },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: [{ $toLower: '$name' }, '$$categoryName'] },
                      { $eq: ['$isActive', true] }
                    ]
                  }
                }
              }
            ],
            as: 'categoryMatch'
          }
        },
        
        // Stage 2: Match products with found category + base filters
        {
          $match: {
            $expr: {
              $and: [
                { $gt: [{ $size: '$categoryMatch' }, 0] },
                { $eq: ['$category', { $arrayElemAt: ['$categoryMatch._id', 0] }] }
              ]
            },
            isActive: true,
            deletedAt: { $in: [null, undefined] }
          }
        },

        // Stage 3: Add category info back and remove temp fields
        {
          $addFields: {
            category: { $arrayElemAt: ['$categoryMatch', 0] }
          }
        },
        {
          $unset: 'categoryMatch'
        }
      ]
    };
  } catch (error) {
    console.error('Error in optimized category lookup by name:', error);  
    return { categoryNotFound: true, useAggregation: false };
  }
}

/**
 * Build price filter query with validation
 * @param {number} minPrice - Minimum price
 * @param {number} maxPrice - Maximum price
 * @returns {Object} - Price filter object
 */
const buildPriceFilter = (minPrice, maxPrice) => {
  const priceFilter = {};
  
  // Validate and set minimum price
  if (minPrice !== undefined && minPrice !== null && minPrice !== '') {
    const min = parseFloat(minPrice);
    if (!isNaN(min) && min >= 0) {
      priceFilter.$gte = min;
    }
  }
  
  // Validate and set maximum price
  if (maxPrice !== undefined && maxPrice !== null && maxPrice !== '') {
    const max = parseFloat(maxPrice);
    if (!isNaN(max) && max >= 0) {
      priceFilter.$lte = max;
    }
  }
  
  // Validate price range logic
  if (priceFilter.$gte && priceFilter.$lte && priceFilter.$gte > priceFilter.$lte) {
    throw new Error('Minimum price cannot be greater than maximum price');
  }
  
  return Object.keys(priceFilter).length > 0 ? { price: priceFilter } : {};
};

/**
 * Build date range filter for timestamps with validation
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)  
 * @param {string} field - Date field name
 * @returns {Object} - Date filter object
 */
const buildDateFilter = (startDate, endDate, field = 'createdAt') => {
  const dateFilter = {};
  
  // Helper function to validate and parse date
  const parseDate = (dateStr, fieldName) => {
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid ${fieldName} date format: ${dateStr}`);
      }
      return date;
    } catch (error) {
      throw new Error(`Invalid ${fieldName} date format: ${dateStr}`);
    }
  };
  
  const start = parseDate(startDate, 'start');
  const end = parseDate(endDate, 'end');
  
  if (start) dateFilter.$gte = start;
  if (end) dateFilter.$lte = end;
  
  // Validate date range
  if (start && end && start > end) {
    throw new Error('Start date cannot be later than end date');
  }
  
  return Object.keys(dateFilter).length > 0 ? { [field]: dateFilter } : {};
};

/**
 * Enhanced parameter validation with detailed error reporting
 * @param {Object} params - Raw query parameters
 * @param {Array} allowedParams - Array of allowed parameter names
 * @returns {Object} - Validation result with sanitized params
 */
const validateQueryParams = (params, allowedParams) => {
  const errors = [];
  const sanitizedParams = {};
  const warnings = [];
  
  // Check for invalid parameters
  const paramKeys = Object.keys(params);
  const invalidParams = paramKeys.filter(key => !allowedParams.includes(key));
  
  if (invalidParams.length > 0) {
    errors.push(`Invalid parameters: ${invalidParams.join(', ')}`);
  }
  
  // Parameter validation and sanitization
  for (const [key, value] of Object.entries(params)) {
    if (!allowedParams.includes(key)) continue;
    
    try {
      const sanitized = _sanitizeParam(key, value);
      if (sanitized.isValid) {
        sanitizedParams[key] = sanitized.value;
        if (sanitized.warning) {
          warnings.push(sanitized.warning);
        }
      } else {
        errors.push(sanitized.error);
      }
    } catch (error) {
      errors.push(`Error processing parameter ${key}: ${error.message}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    sanitizedParams,
    errors,
    warnings
  };
};

/**
 * Sanitize individual parameter based on type
 * @private
 * @param {string} key - Parameter name
 * @param {*} value - Parameter value
 * @returns {Object} - Sanitization result
 */
const _sanitizeParam = (key, value) => {
  const PARAM_RULES = {
    // Numeric parameters
    page: { type: 'positiveInt', min: 1, max: 10000 },
    limit: { type: 'positiveInt', min: 1, max: 100 },
    minPrice: { type: 'nonNegativeFloat', min: 0 },
    maxPrice: { type: 'nonNegativeFloat', min: 0 },
    rating: { type: 'nonNegativeFloat', min: 0, max: 5 },
    
    // String parameters with validation
    sortOrder: { type: 'enum', values: ['asc', 'desc'] },
    sortBy: { type: 'enum', values: ['createdAt', 'updatedAt', 'title', 'price', 'rating', 'stock'] },
    
    // Boolean parameters
    isActive: { type: 'boolean' },
    inStock: { type: 'boolean' },
    featured: { type: 'boolean' },
    includeDeleted: { type: 'boolean' },
    compact: { type: 'boolean' },
    
    // String parameters (general)
    search: { type: 'string', maxLength: 200 },
    category: { type: 'string', maxLength: 100 },
    sellerId: { type: 'objectId' }
  };
  
  const rule = PARAM_RULES[key];
  if (!rule) {
    // Default string handling for unknown parameters
    return _sanitizeString(value, { maxLength: 100 });
  }
  
  switch (rule.type) {
    case 'positiveInt':
      return _sanitizePositiveInt(value, rule);
    case 'nonNegativeFloat':
      return _sanitizeNonNegativeFloat(value, rule);
    case 'enum':
      return _sanitizeEnum(value, rule);
    case 'boolean':
      return _sanitizeBoolean(value);
    case 'string':
      return _sanitizeString(value, rule);
    case 'objectId':
      return _sanitizeObjectId(value);
    default:
      return { isValid: false, error: `Unknown parameter type: ${rule.type}` };
  }
};

/**
 * Sanitize positive integer values
 * @private
 */
const _sanitizePositiveInt = (value, { min = 1, max = Number.MAX_SAFE_INTEGER }) => {
  const num = parseInt(value);
  
  if (isNaN(num)) {
    return { isValid: false, error: 'Must be a valid integer' };
  }
  
  if (num < min) {
    return { isValid: false, error: `Must be at least ${min}` };
  }
  
  if (num > max) {
    return { 
      isValid: true, 
      value: max, 
      warning: `Value capped at maximum ${max}` 
    };
  }
  
  return { isValid: true, value: num };
};

/**
 * Sanitize non-negative float values
 * @private
 */
const _sanitizeNonNegativeFloat = (value, { min = 0, max = Number.MAX_VALUE }) => {
  const num = parseFloat(value);
  
  if (isNaN(num)) {
    return { isValid: false, error: 'Must be a valid number' };
  }
  
  if (num < min) {
    return { isValid: false, error: `Must be at least ${min}` };
  }
  
  if (num > max) {
    return { isValid: false, error: `Must be no more than ${max}` };
  }
  
  return { isValid: true, value: num };
};

/**
 * Sanitize enum values
 * @private
 */
const _sanitizeEnum = (value, { values }) => {
  if (!values.includes(value)) {
    return { 
      isValid: false, 
      error: `Must be one of: ${values.join(', ')}` 
    };
  }
  
  return { isValid: true, value };
};

/**
 * Sanitize boolean values
 * @private
 */
const _sanitizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return { isValid: true, value };
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lower)) {
      return { isValid: true, value: true };
    }
    if (['false', '0', 'no', 'off'].includes(lower)) {
      return { isValid: true, value: false };
    }
  }
  
  return { isValid: false, error: 'Must be a boolean value (true/false)' };
};

/**
 * Sanitize string values
 * @private
 */
const _sanitizeString = (value, { maxLength = 200, minLength = 0 } = {}) => {
  if (typeof value !== 'string') {
    return { isValid: false, error: 'Must be a string' };
  }
  
  const trimmed = value.trim();
  
  if (trimmed.length < minLength) {
    return { isValid: false, error: `Must be at least ${minLength} characters` };
  }
  
  if (trimmed.length > maxLength) {
    return { 
      isValid: true, 
      value: trimmed.substring(0, maxLength),
      warning: `String truncated to ${maxLength} characters` 
    };
  }
  
  return { isValid: true, value: trimmed };
};

/**
 * Sanitize ObjectId values
 * @private
 */
const _sanitizeObjectId = (value) => {
  if (typeof value !== 'string') {
    return { isValid: false, error: 'Must be a string' };
  }
  
  const trimmed = value.trim();
  
  if (!/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return { isValid: false, error: 'Must be a valid 24-character ObjectId' };
  }
  
  return { isValid: true, value: trimmed };
};

/**
 * Build aggregation pipeline for complex queries (optimized)
 * @param {Object} filters - Filter object
 * @param {Object} options - Aggregation options
 * @returns {Array} - MongoDB aggregation pipeline
 */
const buildAggregationPipeline = (filters, options = {}) => {
  const { 
    includeSellerInfo = false, 
    includeCategoryInfo = true,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 20
  } = options;
  
  const pipeline = [];
  
  // Match stage with filters (early filtering for performance)
  if (Object.keys(filters).length > 0) {
    pipeline.push({ $match: filters });
  }
  
  // Lookup stages - optimize by only including what's needed
  if (includeCategoryInfo) {
    pipeline.push({
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryInfo',
        pipeline: [
          { $project: { name: 1, description: 1, isActive: 1 } } // Only fetch needed fields
        ]
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
        as: 'sellerInfo',
        pipeline: [
          { $project: { storeName: 1, storeSlug: 1, logo: 1, contact: 1 } } // Only fetch needed fields
        ]
      }
    });
    
    pipeline.push({
      $unwind: {
        path: '$sellerInfo',
        preserveNullAndEmptyArrays: true
      }
    });
  }
  
  // Add sorting
  const sort = buildSortObject(sortBy, sortOrder);
  pipeline.push({ $sort: sort });
  
  // Add pagination
  const { skip, limit: paginationLimit } = calculatePagination(page, limit);
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: paginationLimit });
  
  return pipeline;
};

module.exports = {
  buildSearchQuery,
  buildSortObject,
  calculatePagination,
  buildPaginationResponse,
  buildCategoryFilter,
  buildPriceFilter,
  buildDateFilter,
  validateQueryParams,
  buildAggregationPipeline
};