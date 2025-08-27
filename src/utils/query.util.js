// utils/queryUtils.js

/**
 * Build search query for text fields
 * @param {string} search - Search term
 * @param {Array} fields - Array of field names to search in
 * @returns {Object} - MongoDB search query
 */
const buildSearchQuery = (search, fields) => {
  if (!search || !fields || fields.length === 0) return {};
  
  return {
    $or: fields.map(field => ({
      [field]: { $regex: search, $options: 'i' }
    }))
  };
};

/**
 * Build sort object from sort parameters
 * @param {string} sortBy - Field to sort by (default: 'createdAt')
 * @param {string} sortOrder - Sort order 'asc' or 'desc' (default: 'desc')
 * @returns {Object} - MongoDB sort object
 */
const buildSortObject = (sortBy = 'createdAt', sortOrder = 'desc') => {
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  return sort;
};

/**
 * Calculate pagination values
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination calculation result
 */
const calculatePagination = (page = 1, limit = 20) => {
  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);
  const skip = (parsedPage - 1) * parsedLimit;
  
  return {
    page: parsedPage,
    limit: parsedLimit,
    skip
  };
};

/**
 * Build pagination response object
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination response object
 */
const buildPaginationResponse = (total, page, limit) => {
  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);
  const skip = (parsedPage - 1) * parsedLimit;
  
  return {
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit),
    hasNext: skip + parsedLimit < total,
    hasPrev: parsedPage > 1
  };
};

/**
 * Build category filter query
 * @param {string} category - Category ID or 'all'
 * @returns {Object} - Category filter object
 */
const buildCategoryFilter = (category) => {
  if (!category || category === 'all') return {};
  return { category };
};

module.exports = {
  buildSearchQuery,
  buildSortObject,
  calculatePagination,
  buildPaginationResponse,
  buildCategoryFilter
};