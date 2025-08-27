// utils/categoryUtils.js
const mongoose = require('mongoose');

/**
 * Validate if string is a valid MongoDB ObjectId
 * @param {string} id - ID to validate
 * @returns {boolean} - True if valid ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Convert image path to full URL
 * @param {string} imagePath - Image path
 * @param {Object} req - Express request object
 * @returns {string|null} - Full image URL or null
 */
const getImageUrl = (imagePath, req) => {
  if (!imagePath) return null;
  
  // If already a full URL, return as is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // Build full URL from request
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  
  // Ensure path starts with /
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  return `${baseUrl}${cleanPath}`;
};

/**
 * Process categories with image URLs
 * @param {Object|Array} categories - Category or array of categories
 * @param {Object} req - Express request object
 * @returns {Object|Array} - Processed categories with full image URLs
 */
const processCategoriesWithImages = (categories, req) => {
  if (!categories) return categories;
  
  if (Array.isArray(categories)) {
    return categories.map(category => {
      const categoryObj = category.toObject ? category.toObject() : category;
      return {
        ...categoryObj,
        image: getImageUrl(categoryObj.image, req)
      };
    });
  } else {
    const categoryObj = categories.toObject ? categories.toObject() : categories;
    return {
      ...categoryObj,
      image: getImageUrl(categoryObj.image, req)
    };
  }
};

module.exports = {
  isValidObjectId,
  getImageUrl,
  processCategoriesWithImages
};