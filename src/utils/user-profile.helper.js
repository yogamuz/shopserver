// utils/profile.helper.js (Updated existing helper)
const logger = require("./logger");
const asyncHandler = require("../middlewares/asyncHandler");

class ProfileHelper {
  /**
   * Process address data from various input formats
   * @param {Object} profileData - Raw profile data from request
   * @returns {Array} Processed addresses array
   */
  static processAddresses(profileData) {
    const addresses = [];

    // Handle multiple addresses array
    if (profileData.addresses && Array.isArray(profileData.addresses)) {
      return profileData.addresses.map((addr, index) => ({
        street: addr.street || "Unknown",
        city: addr.city || "Unknown",
        state: addr.state || "Unknown",
        zipCode: addr.zipCode || "Unknown",
        country: addr.country || "Indonesia",
        label: addr.label || (index === 0 ? "Home" : "Other"),
        isDefault: addr.isDefault || index === 0,
      }));
    }

    // Handle single address object
    if (profileData.address && typeof profileData.address === "object") {
      addresses.push({
        street: profileData.address.street || "Unknown",
        city: profileData.address.city || "Unknown",
        state: profileData.address.state || "Unknown",
        zipCode: profileData.address.zipCode || "Unknown",
        country: profileData.address.country || "Indonesia",
        label: profileData.address.label || "Home",
        isDefault: true,
      });
    }

    // Handle legacy string address
    else if (profileData.address && typeof profileData.address === "string") {
      addresses.push({
        street: profileData.address,
        city: "Unknown",
        state: "Unknown",
        zipCode: "Unknown",
        country: "Indonesia",
        label: "Home",
        isDefault: true,
      });
    }

    return addresses;
  }

  /**
   * Format clean address object
   * @param {Object} address - Address object
   * @param {number} index - Address index (optional)
   * @returns {Object} Clean formatted address
   */
  static formatAddress(address, index = null) {
    if (!address) return null;

    const formatted = {
      name: address.name,
      street: address.street,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country || "Indonesia",
      label: address.label,
      isDefault: address.isDefault || false,
      fullAddress: `${address.street}, ${address.city}, ${address.state} ${address.zipCode}${
        address.country ? `, ${address.country}` : ""
      }`,
    };

    // Add index if provided (for list operations)
    if (index !== null) {
      formatted.index = index;
    }

    return formatted;
  }

  /**
   * Format profile response for API consumption - UPDATED VERSION
   * @param {Object} populatedProfile - Mongoose populated profile document
   * @param {Object} options - Formatting options
   * @returns {Object} Clean formatted profile response
   */
  static formatProfileResponse(populatedProfile, options = {}) {
    const {
      includeUser = true,
      includeAllAddresses = true,
      includeMetadata = false,
      responseType = "full", // 'full', 'address-add', 'address-list', 'address-update'
    } = options;

    // Clean addresses array
    const cleanAddresses = (populatedProfile.addresses || []).map((addr, index) => this.formatAddress(addr, index));

    const defaultAddress = this.getDefaultAddress(cleanAddresses);

    // Base response structure
    const baseResponse = {
      id: populatedProfile._id.toString(),
    };

    // Add user info if needed
    if (includeUser && populatedProfile.user) {
      baseResponse.user = populatedProfile.user._id
        ? {
            id: populatedProfile.user._id.toString(),
            username: populatedProfile.user.username,
            email: populatedProfile.user.email,
            role: populatedProfile.user.role,
            lastSeen: populatedProfile.user.lastSeen, // ← TAMBAH INI
          }
        : populatedProfile.user;
    }

    // Profile basic info
    const profileInfo = {
      firstName: populatedProfile.firstName,
      lastName: populatedProfile.lastName,
      fullName: `${populatedProfile.firstName || ""} ${populatedProfile.lastName || ""}`.trim(),
    };

    // Address information
    const addressInfo = {
      total: cleanAddresses.length,
      default: defaultAddress,
    };

    if (includeAllAddresses) {
      addressInfo.list = cleanAddresses;
    }

    // Response based on type
    switch (responseType) {
      case "address-add":
        return {
          ...baseResponse,
          profile: profileInfo,
          newAddress: cleanAddresses[cleanAddresses.length - 1], // Latest added address
          addresses: addressInfo,
        };

      case "address-list":
        return {
          ...baseResponse,
          addresses: addressInfo,
        };

      case "address-update":
        const updatedIndex = options.updatedIndex;
        return {
          ...baseResponse,
          updatedAddress: cleanAddresses[updatedIndex],
          addresses: {
            total: cleanAddresses.length,
            default: defaultAddress,
          },
        };

      case "full":
      default:
        const fullResponse = {
          ...baseResponse,
          profile: {
            ...profileInfo,
            phone: populatedProfile.phone,
            avatar: populatedProfile.avatar,
            dateOfBirth: populatedProfile.dateOfBirth,
            gender: populatedProfile.gender,
          },
          addresses: addressInfo,
        };

        // Include metadata if requested
        if (includeMetadata) {
          fullResponse.metadata = {
            createdAt: populatedProfile.createdAt,
            updatedAt: populatedProfile.updatedAt,
          };
        }

        return fullResponse;
    }
  }

  /**
   * Build profile data object for database operations
   * @param {string} userId - User ID
   * @param {Object} profileData - Raw profile data
   * @returns {Object} Processed profile data ready for database
   */
  static buildProfileData(userId, profileData) {
    const processedData = {
      user: userId,
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      phone: profileData.phone,
      avatar: profileData.avatar,
      gender: profileData.gender,
    };

    // Handle date of birth
    if (profileData.dateOfBirth) {
      processedData.dateOfBirth = new Date(profileData.dateOfBirth);
    }

    // Process addresses
    processedData.addresses = this.processAddresses(profileData);

    // Set backward compatibility address field
    if (processedData.addresses.length > 0) {
      const firstAddress = processedData.addresses[0];
      processedData.address = `${firstAddress.street}, ${firstAddress.city}`;
    } else if (profileData.address && typeof profileData.address === "string") {
      processedData.address = profileData.address;
    }

    return processedData;
  }

  /**
   * Validate address data with enhanced partial validation support
   * @param {Object} addressData - Address object to validate
   * @param {boolean} isPartialUpdate - Whether this is a partial update (default: false)
   * @returns {Object} Validation result
   */
  static validateAddress(addressData, isPartialUpdate = false) {
    const errors = [];

    // For partial updates, only validate fields that are provided
    if (!isPartialUpdate || addressData.street !== undefined) {
      if (!addressData.street || (typeof addressData.street === "string" && addressData.street.trim() === "")) {
        errors.push("Street cannot be empty");
      }
    }

    if (!isPartialUpdate || addressData.city !== undefined) {
      if (!addressData.city || (typeof addressData.city === "string" && addressData.city.trim() === "")) {
        errors.push("City cannot be empty");
      }
    }

    if (!isPartialUpdate || addressData.state !== undefined) {
      if (!addressData.state || (typeof addressData.state === "string" && addressData.state.trim() === "")) {
        errors.push("State cannot be empty");
      }
    }

    if (!isPartialUpdate || addressData.zipCode !== undefined) {
      if (!addressData.zipCode || (typeof addressData.zipCode === "string" && addressData.zipCode.trim() === "")) {
        errors.push("Zip code cannot be empty");
      }
    }

    // Optional field validations
    if (addressData.country !== undefined) {
      if (typeof addressData.country === "string" && addressData.country.trim() === "") {
        errors.push("Country cannot be empty if provided");
      }
    }

    if (addressData.label !== undefined) {
      const validLabels = ["Home", "Office", "Other"];
      if (!validLabels.includes(addressData.label)) {
        errors.push(`Label must be one of: ${validLabels.join(", ")}`);
      }
    }

    if (addressData.isDefault !== undefined) {
      if (typeof addressData.isDefault !== "boolean") {
        errors.push("isDefault must be a boolean value");
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  }

  /**
   * Validate Indonesian phone number format
   * @param {string} phone - Phone number to validate
   * @returns {boolean} Whether phone number is valid
   */
  static validatePhoneNumber(phone) {
    if (!phone) return true; // Phone is optional

    // Indonesian phone number patterns
    const patterns = [
      /^\+62[0-9]{8,12}$/, // +62xxxxxxxxxx
      /^08[0-9]{8,12}$/, // 08xxxxxxxxxx
    ];

    return patterns.some(pattern => pattern.test(phone));
  }

  /**
   * Sanitize profile data for logging
   * @param {Object} profileData - Profile data to sanitize
   * @returns {Object} Sanitized data for logging
   */
  static sanitizeForLogging(profileData) {
    return {
      hasFirstName: !!profileData.firstName,
      hasLastName: !!profileData.lastName,
      hasPhone: !!profileData.phone,
      hasAddress: !!profileData.address,
      addressType: typeof profileData.address,
      hasAddresses: !!profileData.addresses,
      addressesCount: profileData.addresses?.length || 0,
      hasAvatar: !!profileData.avatar,
      hasDateOfBirth: !!profileData.dateOfBirth,
      hasGender: !!profileData.gender,
    };
  }

  /**
   * Generate backward compatibility address string from structured address
   * @param {Object} address - Structured address object
   * @returns {string} Formatted address string
   */
  static generateAddressString(address) {
    if (!address) return "";

    const parts = [address.street, address.city, address.state, address.zipCode].filter(
      part => part && part !== "Unknown"
    );

    return parts.join(", ");
  }

  /**
   * Get default address from addresses array
   * @param {Array} addresses - Array of addresses
   * @returns {Object|null} Default address or null
   */
  static getDefaultAddress(addresses) {
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return null;
    }

    // Find address marked as default
    const defaultAddr = addresses.find(addr => addr.isDefault === true);

    // Return first address if no default is explicitly set
    return defaultAddr || addresses[0];
  }
}

module.exports = ProfileHelper;
