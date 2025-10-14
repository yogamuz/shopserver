// seller-profile.controller.js - SELLER FOCUSED PROFILE OPERATIONS
const asyncHandler = require("../../middlewares/asyncHandler");
const SellerProfileService = require("../../services/seller/seller-profile.service");
const ResponseHelper = require("../../utils/response.helper");
const { HTTP_STATUS, MESSAGES } = require("../../constants/httpStatus");
const logger = require("../../utils/logger");

/**
 * Seller Profile Controller
 * Handles HTTP requests and delegates business logic to service layer
 * SELLER FOCUSED OPERATIONS ONLY
 */
class SellerProfileController {
  /**
   * Create seller profile
   */
  static createProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId since req.user is the User object from authMiddleware
    const userId = req.user._id || req.user.id;
    const { storeName, description, address, contact } = req.body;

    logger.info(`🏪 Creating seller profile for user: ${userId}`);
    logger.info(`👤 User info:`, {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role,
    });

    // Check if seller profile already exists
    const profileExists = await SellerProfileService.profileExists(userId);
    if (profileExists) {
      return ResponseHelper.badRequest(res, MESSAGES.SELLER_PROFILE.ALREADY_EXISTS);
    }

    // Verify user exists and is active
    const user = await SellerProfileService.verifyUser(userId);
    if (!user) {
      logger.info(`❌ User verification failed for ID: ${userId}`);
      return ResponseHelper.notFound(res, MESSAGES.USER.NOT_FOUND_OR_INACTIVE);
    }

    logger.info(`✅ User verified: ${user.username}`);

    // Create seller profile
    const sellerProfile = await SellerProfileService.createProfile({
      userId,
      storeName,
      description,
      address,
      contact,
    });

    logger.info(`✅ Seller profile created: ${sellerProfile.storeName}`);

    return ResponseHelper.created(res, MESSAGES.SELLER_PROFILE.CREATED, sellerProfile);
  });

  /**
   * Get seller profile
   */
  static getProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;

    logger.info(`🔍 Getting seller profile for user: ${userId}`);

    const profileData = await SellerProfileService.getProfileWithStats(userId);

    if (!profileData) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // ✅ TAMBAH: Log response sebelum kirim
    logger.info("📤 Sending profile response with userId:", profileData.userId);

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Profile retrieved successfully", profileData);
  });

  /**
   * Update seller profile (includes status changes like archive/restore)
   */
  static updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const updates = req.body;

    logger.info(`🔄 Updating seller profile for user: ${userId}`);
    logger.info(`📝 Request body:`, updates);

    // ✅ TAMBAH: Log social links specifically
    if (updates.contact?.socialLinks) {
      logger.info(`🔗 Social links update:`, JSON.stringify(updates.contact.socialLinks));
    }

    if (!userId) {
      logger.error("❌ No userId found in request");
      return ResponseHelper.badRequest(res, "User ID is required");
    }

    // Handle status updates (archive/restore)
    if (updates.status) {
      const validStatuses = ["active", "archived", "inactive"];
      if (!validStatuses.includes(updates.status)) {
        return ResponseHelper.badRequest(res, "Invalid status. Must be: active, archived, or inactive");
      }

      // Handle archive operation
      if (updates.status === "archived") {
        const archivedProfile = await SellerProfileService.archiveProfile(userId);
        if (!archivedProfile) {
          return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
        }
        logger.info(`✅ Seller profile archived: ${archivedProfile.storeName}`);
        return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.SELLER_PROFILE.ARCHIVED, archivedProfile);
      }

      // Handle restore operation
      if (updates.status === "active") {
        const restoredProfile = await SellerProfileService.restoreProfile(userId);
        if (!restoredProfile) {
          return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
        }
        logger.info(`✅ Seller profile restored: ${restoredProfile.storeName}`);
        return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.SELLER_PROFILE.RESTORED, restoredProfile);
      }
    }

    // Regular profile update
    const updatedProfile = await SellerProfileService.updateProfile(userId, updates);

    if (!updatedProfile) {
      logger.info("❌ Profile not found or update failed");
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    const storeName = updatedProfile.storeName || "Unknown Store";
    logger.info(`✅ Seller profile updated: ${storeName}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.SELLER_PROFILE.UPDATED, updatedProfile);
  });
  // seller-profile.controller.js

  /**
   * Upload store logo - FIXED VERSION
   */
  static uploadLogo = asyncHandler(async (req, res) => {
    // ✅ Validasi file
    if (!req.file) {
      return ResponseHelper.badRequest(res, "No image file uploaded. Please select an image file.");
    }

    const userId = req.user._id || req.user.id;

    try {
      const result = await SellerProfileService.uploadStoreImage(userId, "logo", req.file);

      if (!result) {
        return ResponseHelper.notFound(res, "Seller profile not found");
      }

      // ✅ Gunakan ResponseHelper yang konsisten
      return ResponseHelper.success(res, HTTP_STATUS.OK, "Logo uploaded successfully", result);
    } catch (error) {
      logger.error("Upload logo error:", error);
      return ResponseHelper.serverError(res, "Failed to upload logo");
    }
  });

  /**
   * Upload store banner - FIXED VERSION
   */
  static uploadBanner = asyncHandler(async (req, res) => {
    // ✅ Validasi file
    if (!req.file) {
      return ResponseHelper.badRequest(res, "No image file uploaded. Please select an image file.");
    }

    const userId = req.user._id || req.user.id;

    try {
      const result = await SellerProfileService.uploadStoreImage(userId, "banner", req.file);

      if (!result) {
        return ResponseHelper.notFound(res, "Seller profile not found");
      }

      // ✅ Gunakan ResponseHelper yang konsisten
      return ResponseHelper.success(res, HTTP_STATUS.OK, "Banner uploaded successfully", result);
    } catch (error) {
      logger.error("Upload banner error:", error);
      return ResponseHelper.serverError(res, "Failed to upload banner");
    }
  });
  /**
   * Soft delete seller profile
   */
  static softDeleteProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;

    logger.info(`🗑️ Soft deleting seller profile for user: ${userId}`);

    const deletedProfile = await SellerProfileService.softDeleteProfile(userId);

    if (!deletedProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    logger.info(`✅ Seller profile soft deleted: ${deletedProfile.storeName}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.SELLER_PROFILE.SOFT_DELETED);
  });

  /**
   * Activate seller profile
   */
  static activateProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;

    logger.info(`🔄 Activating seller profile for user: ${userId}`);

    const activatedProfile = await SellerProfileService.activateProfile(userId);

    if (!activatedProfile) {
      return ResponseHelper.notFound(res, "No deactivated profile found to activate");
    }

    logger.info(`✅ Seller profile activated: ${activatedProfile.storeName}`);

    return ResponseHelper.success(res, HTTP_STATUS.OK, MESSAGES.SELLER_PROFILE.ACTIVATED, activatedProfile);
  });

  static getPublicProfile = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    logger.info(`👀 Getting public seller profile: ${slug}`);

    const publicProfile = await SellerProfileService.getPublicProfile(slug);

    if (!publicProfile) {
      return ResponseHelper.notFound(res, MESSAGES.STORE.NOT_FOUND);
    }

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Store profile retrieved successfully", publicProfile);
  });

  /**
   * Get all active stores (public)
   */
  static getAllStores = asyncHandler(async (req, res) => {
    const { page = 1, limit = 12, search, city, sortBy = "createdAt", sortOrder = -1 } = req.query;

    logger.info(`🏪 Getting all active stores - Page: ${page}`);

    const storesData = await SellerProfileService.getAllActiveStores({
      page,
      limit,
      search,
      city,
      sortBy,
      sortOrder,
    });

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Stores retrieved successfully", storesData);
  });

  /**
   * Get store review statistics (public)
   */
  static getStoreReviewStats = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    logger.info(`📊 Getting review stats for store: ${slug}`);

    // Import SellerOrderService
    const SellerOrderService = require("../../services/seller/seller-order.service");

    // Get review stats by slug (public method)
    const stats = await SellerOrderService.getPublicReviewStatsBySlug(slug);

    return ResponseHelper.success(res, HTTP_STATUS.OK, "Review statistics retrieved successfully", stats);
  });
}

module.exports = SellerProfileController;
