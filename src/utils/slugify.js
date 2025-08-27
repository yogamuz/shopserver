const mongoose = require("mongoose");

/**
 * Convert string to URL-friendly slug
 * @param {string} text - Text to convert to slug
 * @returns {string} - URL-friendly slug
 */
const createSlug = (text) => {
  if (!text) return '';
  
  return text
    .toString()
    .toLowerCase()
    // Replace spaces and special characters with hyphens
    .replace(/[\s\W-]+/g, '-')
    // Remove multiple consecutive hyphens
    .replace(/-{2,}/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length to 100 characters
    .substring(0, 100);
};

/**
 * Create unique slug by checking database for existing slugs
 * @param {string} text - Original text to slugify
 * @param {string} modelName - Mongoose model name to check against
 * @param {string} field - Field name to check (default: 'storeSlug' for SellerProfile, 'slug' for others)
 * @param {string} excludeId - ID to exclude from uniqueness check (for updates)
 * @returns {Promise<string>} - Unique slug
 */
const createUniqueSlug = async (text, modelName, field = null, excludeId = null) => {
  try {
    const Model = mongoose.model(modelName);
    
    // Determine field name based on model
    const fieldName = field || (modelName === 'SellerProfile' ? 'storeSlug' : 'slug');
    
    let baseSlug = createSlug(text);
    let uniqueSlug = baseSlug;
    let counter = 1;
    
    // Keep checking until we find a unique slug
    while (true) {
      const query = { [fieldName]: uniqueSlug };
      
      // Exclude current document if updating
      if (excludeId) {
        query._id = { $ne: excludeId };
      }
      
      // For SellerProfile, also check if not deleted
      if (modelName === 'SellerProfile') {
        query.deletedAt = null;
      }
      
      const existingDoc = await Model.findOne(query);
      
      if (!existingDoc) {
        // Slug is unique, return it
        return uniqueSlug;
      }
      
      // Slug exists, try with counter
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
      
      // Prevent infinite loops
      if (counter > 1000) {
        // Use timestamp as fallback
        uniqueSlug = `${baseSlug}-${Date.now()}`;
        break;
      }
    }
    
    return uniqueSlug;
    
  } catch (error) {
    logger.error('Error creating unique slug:', error);
    // Fallback: return base slug with timestamp
    return `${createSlug(text)}-${Date.now()}`;
  }
};

/**
 * Validate slug format
 * @param {string} slug - Slug to validate
 * @returns {boolean} - True if valid slug format
 */
const validateSlug = (slug) => {
  if (!slug) return false;
  
  // Check if slug matches required pattern
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  
  return slugPattern.test(slug) && 
         slug.length >= 3 && 
         slug.length <= 100 &&
         !slug.startsWith('-') &&
         !slug.endsWith('-');
};

/**
 * Generate slug suggestions based on input text
 * @param {string} text - Original text
 * @param {number} count - Number of suggestions to generate
 * @returns {string[]} - Array of slug suggestions
 */
const generateSlugSuggestions = (text, count = 5) => {
  const baseSlug = createSlug(text);
  const suggestions = [baseSlug];
  
  // Generate variations
  for (let i = 1; i < count; i++) {
    suggestions.push(`${baseSlug}-${i}`);
  }
  
  // Add timestamp variant
  suggestions.push(`${baseSlug}-${Date.now().toString().slice(-6)}`);
  
  return suggestions.slice(0, count);
};

/**
 * Check if slug is available for a specific model
 * @param {string} slug - Slug to check
 * @param {string} modelName - Model name to check against
 * @param {string} excludeId - ID to exclude from check
 * @returns {Promise<boolean>} - True if slug is available
 */
const isSlugAvailable = async (slug, modelName, excludeId = null) => {
  try {
    if (!validateSlug(slug)) {
      return false;
    }
    
    const Model = mongoose.model(modelName);
    const fieldName = modelName === 'SellerProfile' ? 'storeSlug' : 'slug';
    
    const query = { [fieldName]: slug };
    
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    
    if (modelName === 'SellerProfile') {
      query.deletedAt = null;
    }
    
    const existingDoc = await Model.findOne(query);
    return !existingDoc;
    
  } catch (error) {
    logger.error('Error checking slug availability:', error);
    return false;
  }
};

/**
 * Update slug for existing document
 * @param {string} docId - Document ID
 * @param {string} newText - New text to create slug from
 * @param {string} modelName - Model name
 * @returns {Promise<string>} - New unique slug
 */
const updateSlug = async (docId, newText, modelName) => {
  try {
    const fieldName = modelName === 'SellerProfile' ? 'storeSlug' : 'slug';
    const newSlug = await createUniqueSlug(newText, modelName, fieldName, docId);
    
    const Model = mongoose.model(modelName);
    await Model.findByIdAndUpdate(docId, { [fieldName]: newSlug });
    
    return newSlug;
  } catch (error) {
    logger.error('Error updating slug:', error);
    throw new Error('Failed to update slug');
  }
};

module.exports = {
  createSlug,
  createUniqueSlug,
  validateSlug,
  generateSlugSuggestions,
  isSlugAvailable,
  updateSlug
};