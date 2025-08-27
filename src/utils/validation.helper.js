// validation.helper.js - Tambahkan method untuk validate image URL (optional)

/**
 * Validation helper utilities
 */
class ValidationHelper {
  // ... existing methods tetap sama ...

  /**
   * Validate image URL (optional)
   * @param {string|null|undefined} imageUrl - Image URL to validate
   * @returns {Object} Validation result
   */
  static validateImageUrl(imageUrl) {
    // If no image provided, it's valid (optional)
    if (!imageUrl || imageUrl.trim() === "") {
      return {
        isValid: true,
        value: null,
        message: "No image provided - will use alt text fallback",
      };
    }

    // Basic URL validation
    try {
      new URL(imageUrl);
      return {
        isValid: true,
        value: imageUrl.trim(),
        message: "Valid image URL",
      };
    } catch (error) {
      return {
        isValid: false,
        value: null,
        message: "Invalid image URL format",
      };
    }
  }

  /**
   * Validate product creation data
   * @param {Object} productData - Product data to validate
   * @returns {Object} Validation result with validated data
   */

  static validateProductIds(productIds) {
    return Array.isArray(productIds) && productIds.length > 0;
  }

  /**
   * Validate time period
   * @param {string} period - Time period
   * @returns {string} Validated period
   */
  static validatePeriod(period) {
    const validPeriods = ["7d", "30d", "90d", "1y"];
    return validPeriods.includes(period) ? period : "30d";
  }

  /**
   * Validate price range
   * @param {string|number} minPrice - Minimum price
   * @param {string|number} maxPrice - Maximum price
   * @returns {boolean} True if valid
   */
  static validatePriceRange(minPrice, maxPrice) {
    if (!minPrice && !maxPrice) return true;

    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);

    if (minPrice && isNaN(min)) return false;
    if (maxPrice && isNaN(max)) return false;
    if (minPrice && maxPrice && min > max) return false;

    return true;
  }
  static validateProductData(productData) {
    const { title, description, price, category, stock, image } = productData;
    const errors = [];
    const validatedData = {};

    // Validate title
    if (!title || typeof title !== "string" || title.trim().length < 3) {
      errors.push("Title must be at least 3 characters long");
    } else {
      validatedData.title = title.trim();
    }

    // Validate description
    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length < 10
    ) {
      errors.push("Description must be at least 10 characters long");
    } else {
      validatedData.description = description.trim();
    }

    // Validate price
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      errors.push("Price must be a positive number");
    } else {
      validatedData.price = parsedPrice;
    }

    // Validate category
    if (!category || typeof category !== "string") {
      errors.push("Category ID is required");
    } else {
      validatedData.category = category;
    }

    // Validate stock
    const parsedStock = parseInt(stock);
    if (isNaN(parsedStock) || parsedStock < 0) {
      errors.push("Stock must be a non-negative integer");
    } else {
      validatedData.stock = parsedStock;
    }

    // Fix: Make image truly optional - accept empty string, null, or undefined
    if (
      !image ||
      image.trim() === "" ||
      image === null ||
      image === undefined
    ) {
      validatedData.image = null; // Set to null for optional
    } else {
      // Validate if image is provided
      const imageValidation = this.validateImageUrl(image);
      if (!imageValidation.isValid) {
        errors.push(imageValidation.message);
      } else {
        validatedData.image = imageValidation.value;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: validatedData,
      hasImage: !!validatedData.image,
    };
  }
}
module.exports = ValidationHelper;
