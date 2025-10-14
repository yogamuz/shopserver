// user-profile.controller.js - USER FOCUSED OPERATIONS
const userService = require("../../services/user/user.service");
const userProfileService = require("../../services/user/user-profile.service");
const { filterUserData } = require("../../utils/filter-user-data.util");
const asyncHandler = require("../../middlewares/asyncHandler");
const { HTTP_STATUS, MESSAGES } = require("../../constants/httpStatus");
const logger = require("../../utils/logger");

/**
 * User Controller
 * Handles USER FOCUSED RESTful operations for profile management
 */
class UserController {
  // GET /api/users/me
  static getMyProfile = asyncHandler(async (req, res) => {
    logger.info("👤 Getting profile for user:", req.user._id);

    const result = await userProfileService.getProfile(req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  });

  // POST /api/users/me
  static createMyProfile = asyncHandler(async (req, res) => {
    logger.info("Creating profile for user:", req.user._id);

    try {
      const result = await userProfileService.createProfile(req.user._id, req.body);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error in createMyProfile:", {
        errorMessage: error.message,
        userId: req.user._id,
      });

      // Handle profile already exists
      if (error.message.includes("USE_PUT_TO_UPDATE") || error.message.includes("ALREADY_EXISTS")) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: "Profile already exists. Use PUT to update existing profile.",
          code: "PROFILE_EXISTS",
          data: null,
        });
      }

      // Handle validation errors
      if (error.message.includes("Validation failed") || error.name === "ValidationError") {
        const validationErrors =
          error.name === "ValidationError" ? Object.values(error.errors).map(err => err.message) : [error.message];

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Profile validation failed",
          code: "VALIDATION_ERROR",
          data: {
            errors: validationErrors,
          },
        });
      }

      // Handle phone validation
      if (error.message.includes("Phone number must be valid")) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Invalid phone number format. Use Indonesian format (+62xxxxxxxxxx or 08xxxxxxxxxx)",
          code: "INVALID_PHONE",
          data: null,
        });
      }

      // Generic error response
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to create profile. Please try again.",
        code: "PROFILE_CREATE_FAILED",
        data: null,
        ...(process.env.NODE_ENV === "development" && {
          debug: {
            errorMessage: error.message,
            errorName: error.name,
          },
        }),
      });
    }
  });

  // PUT /api/users/me
  static updateMyProfile = asyncHandler(async (req, res) => {
    const { username, firstName, lastName, phone, address, addresses, avatar, dateOfBirth, gender } = req.body;
    const userId = req.user._id;

    logger.info("Updating profile for user:", userId);

    try {
      // Update User (if username provided)
      if (username) {
        await userService.updateUserById(userId, { username });
      }

      // Update Profile (if profile fields provided)
      const profileUpdates = { firstName, lastName, phone, address, addresses, avatar, dateOfBirth, gender };
      const result = await userProfileService.updateProfile(userId, profileUpdates);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error in updateMyProfile:", {
        errorMessage: error.message,
        userId: userId,
      });

      // Handle validation errors
      if (error.message.includes("Validation failed") || error.name === "ValidationError") {
        const validationErrors =
          error.name === "ValidationError" ? Object.values(error.errors).map(err => err.message) : [error.message];

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Profile validation failed",
          code: "VALIDATION_ERROR",
          data: {
            errors: validationErrors,
          },
        });
      }

      // Handle phone validation
      if (error.message.includes("Phone number must be valid")) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Invalid phone number format. Use Indonesian format (+62xxxxxxxxxx or 08xxxxxxxxxx)",
          code: "INVALID_PHONE",
          data: null,
        });
      }

      // Generic error response
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to update profile. Please try again.",
        code: "PROFILE_UPDATE_FAILED",
        data: null,
      });
    }
  });

  // DELETE /api/users/me soft delete (deactive)
  static deleteMyAccount = asyncHandler(async (req, res) => {
    logger.info(`🗑️ User ${req.user.username} deleting own account`);

    await userService.softDeleteUser(req.user._id, req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Account deactivated successfully",
    });
  });

  // POST api/users/me/avatar
  static uploadMyAvatar = asyncHandler(async (req, res) => {
    logger.info("🖼️ Uploading avatar for user:", req.user._id);

    if (!req.file) {
      const error = new Error(MESSAGES.PROFILE.AVATAR_FILE_REQUIRED);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    const result = await userProfileService.uploadAvatar(req.user._id, req.file);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  });

  // DELETE /api/users/me/avatar
  static removeMyAvatar = asyncHandler(async (req, res) => {
    logger.info("🗑️ Removing avatar for user:", req.user._id);

    const result = await userProfileService.removeAvatar(req.user._id);

    if (result.message === MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  });

  static getMyAddresses = asyncHandler(async (req, res) => {
    logger.info("📋 Getting addresses for user:", req.user._id);

    const result = await userProfileService.getAddresses(req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  });

  // Clean addMyAddress method without express-validator
  static addMyAddress = asyncHandler(async (req, res) => {
    logger.info("➕ Adding address for user:", req.user._id);

    try {
      const addressData = req.body;

      // Simple manual validation
      if (!addressData.street || addressData.street.trim() === "") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Street is required",
          code: "MISSING_STREET",
        });
      }

      if (!addressData.city || addressData.city.trim() === "") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "City is required",
          code: "MISSING_CITY",
        });
      }

      if (!addressData.state || addressData.state.trim() === "") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "State is required",
          code: "MISSING_STATE",
        });
      }

      if (!addressData.zipCode || addressData.zipCode.trim() === "") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Zip code is required",
          code: "MISSING_ZIPCODE",
        });
      }

      const result = await userProfileService.addAddress(req.user._id, addressData);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error in addMyAddress:", {
        errorMessage: error.message,
        userId: req.user._id,
        requestBody: req.body,
      });

      // Handle address validation from helper
      if (error.message.includes("Address validation failed")) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: error.message,
          code: "ADDRESS_VALIDATION_ERROR",
        });
      }

      // Generic error response
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to add address. Please try again.",
        code: "ADDRESS_ADD_FAILED",
      });
    }
  });

  // Clean updateMyAddress method without express-validator
  static updateMyAddress = asyncHandler(async (req, res) => {
    const addressIndex = parseInt(req.params.index);
    logger.info(`Updating address ${addressIndex} for user:`, req.user._id);

    // Validate address index parameter
    if (isNaN(addressIndex) || addressIndex < 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid address index. Must be a non-negative number.",
        code: "INVALID_INDEX",
      });
    }

    try {
      const addressData = req.body;

      // Simple validation - at least one field should be provided
      const updateFields = ["street", "city", "state", "zipCode", "country", "label", "isDefault"];
      const hasValidFields = updateFields.some(field => addressData[field] !== undefined);

      if (!hasValidFields) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "At least one address field must be provided for update",
          code: "NO_UPDATE_FIELDS",
        });
      }

      const result = await userProfileService.updateAddress(req.user._id, addressIndex, addressData);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error in updateMyAddress:", {
        errorMessage: error.message,
        userId: req.user._id,
        addressIndex: addressIndex,
        requestBody: req.body,
      });

      // Handle specific error types
      if (error.message === "Profile not found") {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: "User profile not found. Please create a profile first.",
          code: "PROFILE_NOT_FOUND",
        });
      }

      if (error.message === "Invalid address index") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: `Address at index ${addressIndex} does not exist`,
          code: "ADDRESS_NOT_FOUND",
        });
      }

      if (error.message.includes("Address validation failed")) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: error.message,
          code: "VALIDATION_ERROR",
        });
      }

      // Generic error response
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to update address. Please try again.",
        code: "UPDATE_FAILED",
      });
    }
  });

  static removeMyAddress = asyncHandler(async (req, res) => {
    logger.info("🗑️ Removing address for user:", req.user._id);

    const addressIndex = parseInt(req.params.index);

    if (isNaN(addressIndex) || addressIndex < 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid address index",
        code: "INVALID_INDEX",
      });
    }

    try {
      const result = await userProfileService.removeAddress(req.user._id, addressIndex);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error in removeMyAddress:", {
        errorMessage: error.message,
        userId: req.user._id,
        addressIndex: addressIndex,
      });

      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to remove address. Please try again.",
        code: "REMOVE_FAILED",
      });
    }
  });

  static setDefaultAddress = asyncHandler(async (req, res) => {
    req.body = req.body || {};
    logger.info("⭐ Setting default address for user:", req.user._id);

    const addressIndex = parseInt(req.params.index);

    if (isNaN(addressIndex) || addressIndex < 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid address index",
        code: "INVALID_INDEX",
      });
    }

    try {
      const result = await userProfileService.setDefaultAddress(req.user._id, addressIndex);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Error in setDefaultAddress:", {
        errorMessage: error.message,
        userId: req.user._id,
        addressIndex: addressIndex,
      });

      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to set default address. Please try again.",
        code: "SET_DEFAULT_FAILED",
      });
    }
  });


static upgradeToSeller = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  logger.info("🔄 Upgrade to seller request for user:", userId);

  // Validate current role
  if (req.user.role === 'seller') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "You are already a seller. Access your seller dashboard to manage your shop.",
      code: "ALREADY_SELLER",
    });
  }

  if (req.user.role === 'admin') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Admin accounts cannot be upgraded to seller",
      code: "ADMIN_CANNOT_UPGRADE",
    });
  }

  try {
    // Optional: User can still provide custom data if they want
    const { shopName, shopDescription, businessType, businessAddress, businessPhone } = req.body;
    
    const customData = {};
    if (shopName) customData.shopName = shopName;
    if (shopDescription) customData.shopDescription = shopDescription;
    if (businessType) customData.businessType = businessType;
    if (businessAddress) customData.businessAddress = businessAddress;
    if (businessPhone) customData.businessPhone = businessPhone;

    const result = await userProfileService.upgradeToSeller(userId, customData);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Successfully upgraded to seller! You can now access your seller dashboard to start selling.",
      data: result.data,
      nextSteps: {
        dashboard: "/seller/dashboard",
        actions: [
          "Complete your shop profile",
          "Add your first product",
          "Set up payment methods",
          "Review seller guidelines"
        ]
      }
    });
  } catch (error) {
    logger.error("Error in upgradeToSeller:", {
      errorMessage: error.message,
      userId: userId,
    });

    if (error.message.includes("already exists")) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: "Seller profile already exists. You may already be a seller.",
        code: "SELLER_PROFILE_EXISTS",
      });
    }

    if (error.message.includes("Validation failed")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to upgrade to seller. Please try again later or contact support.",
      code: "UPGRADE_FAILED",
    });
  }
});

}

module.exports = UserController;
