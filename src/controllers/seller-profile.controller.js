const asyncHandler = require("../middlewares/asyncHandler");
const sellerProfileService = require("../services/seller-profile.service");
const ResponseHelper = require("../utils/response.helper");
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const logger = require("../utils/logger");
/**
 * Seller Profile Controller
 * Handles HTTP requests and delegates business logic to service layer
 */
class SellerProfileController {
  /**
   * Create seller profile
   */
  createProfile = asyncHandler(async (req, res) => {
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
    const profileExists = await sellerProfileService.profileExists(userId);
    if (profileExists) {
      return ResponseHelper.badRequest(
        res,
        MESSAGES.SELLER_PROFILE.ALREADY_EXISTS
      );
    }

    // Verify user exists and is active
    const user = await sellerProfileService.verifyUser(userId);
    if (!user) {
      logger.info(`❌ User verification failed for ID: ${userId}`);
      return ResponseHelper.notFound(res, MESSAGES.USER.NOT_FOUND_OR_INACTIVE);
    }

    logger.info(`✅ User verified: ${user.username}`);

    // Create seller profile
    const sellerProfile = await sellerProfileService.createProfile({
      userId,
      storeName,
      description,
      address,
      contact,
    });

    logger.info(`✅ Seller profile created: ${sellerProfile.storeName}`);

    return ResponseHelper.created(
      res,
      MESSAGES.SELLER_PROFILE.CREATED,
      sellerProfile
    );
  });

  /**
   * Get seller profile
   */
  getProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;

    logger.info(`🔍 Getting seller profile for user: ${userId}`);

    const profileData = await sellerProfileService.getProfileWithStats(userId);

    if (!profileData) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Profile retrieved successfully",
      profileData
    );
  });

  /**
   * Update seller profile
   */
  /**
   * Update seller profile - Fixed version
   */
  updateProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;
    const updates = req.body;

    logger.info(`🔄 Updating seller profile for user: ${userId}`);
    logger.info(`📝 Request body:`, updates);
    logger.info(`👤 User object:`, {
      _id: req.user._id,
      id: req.user.id,
      username: req.user.username,
    });

    // FIX: Validasi userId
    if (!userId) {
      logger.error("❌ No userId found in request");
      return ResponseHelper.badRequest(res, "User ID is required");
    }

    const updatedProfile = await sellerProfileService.updateProfile(
      userId,
      updates
    );

    if (!updatedProfile) {
      logger.info("❌ Profile not found or update failed");
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    // FIX: Safe logging dengan fallback
    const storeName = updatedProfile.storeName || "Unknown Store";
    logger.info(`✅ Seller profile updated: ${storeName}`);

    // FIX: Log seluruh object untuk debugging
    logger.info("📋 Updated profile object:", {
      _id: updatedProfile._id,
      storeName: updatedProfile.storeName,
      storeSlug: updatedProfile.storeSlug,
      userId: updatedProfile.userId,
    });

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.UPDATED,
      updatedProfile
    );
  });

  /**
   * Upload store images (logo/banner)
   */
  uploadStoreImage = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;
    const { imageType } = req.params;

    if (!["logo", "banner"].includes(imageType)) {
      return ResponseHelper.badRequest(res, MESSAGES.IMAGE.INVALID_TYPE);
    }

    logger.info(`📸 Uploading ${imageType} for seller: ${userId}`);

    const result = await sellerProfileService.uploadStoreImage(
      userId,
      imageType,
      req.file
    );

    if (!result.success) {
      return ResponseHelper.badRequest(res, result.message);
    }

    logger.info(
      `✅ ${imageType} uploaded successfully for seller: ${result.storeName}`
    );

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      `${imageType} ${MESSAGES.SELLER_PROFILE.IMAGE_UPLOADED}`,
      { [imageType]: result.imageUrl }
    );
  });

  /**
   * Archive seller profile
   */
  archiveProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;

    logger.info(`📦 Archiving seller profile for user: ${userId}`);

    const archivedProfile = await sellerProfileService.archiveProfile(userId);

    if (!archivedProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    logger.info(`✅ Seller profile archived: ${archivedProfile.storeName}`);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.ARCHIVED,
      archivedProfile
    );
  });

  /**
   * Restore seller profile
   */
  restoreProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;

    logger.info(`🔄 Restoring seller profile for user: ${userId}`);

    const restoredProfile = await sellerProfileService.restoreProfile(userId);

    if (!restoredProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    logger.info(`✅ Seller profile restored: ${restoredProfile.storeName}`);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.RESTORED,
      restoredProfile
    );
  });

  /**
   * Soft delete seller profile
   */
  softDeleteProfile = asyncHandler(async (req, res) => {
    // FIX: Use _id instead of userId
    const userId = req.user._id || req.user.id;

    logger.info(`🗑️ Soft deleting seller profile for user: ${userId}`);

    const deletedProfile = await sellerProfileService.softDeleteProfile(userId);

    if (!deletedProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    logger.info(`✅ Seller profile soft deleted: ${deletedProfile.storeName}`);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.SOFT_DELETED
    );
  });

  /**
   * Admin soft delete seller profile by profileId
   */
  adminSoftDeleteProfile = asyncHandler(async (req, res) => {
    const { profileId } = req.params;

    logger.info(`🗑️ Admin soft deleting seller profile: ${profileId}`);

    const deletedProfile = await sellerProfileService.adminSoftDeleteProfile(
      profileId
    );

    if (!deletedProfile) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    logger.info(
      `✅ Seller profile soft deleted by admin: ${deletedProfile.storeName}`
    );

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.SOFT_DELETED,
      deletedProfile
    );
  });

/**
 * Get specific profile detail for admin
 */
getAdminProfileDetail = asyncHandler(async (req, res) => {
  const { profileId } = req.params;

  logger.info(`👑 Admin getting profile detail: ${profileId}`);

  const profileData = await sellerProfileService.getProfileById(profileId);

  if (!profileData) {
    return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
  }

  return ResponseHelper.success(
    res,
    HTTP_STATUS.OK,
    "Profile detail retrieved successfully",
    profileData
  );
});

/**
 * Admin activate seller profile by profileId
 */
adminActivateProfile = asyncHandler(async (req, res) => {
  const { profileId } = req.params;

  logger.info(`🔄 Admin activating seller profile: ${profileId}`);

  const activatedProfile = await sellerProfileService.adminActivateProfile(profileId);

  if (!activatedProfile) {
    return ResponseHelper.notFound(
      res,
      "No deactivated profile found to activate"
    );
  }

  logger.info(`✅ Seller profile activated by admin: ${activatedProfile.storeName}`);

  return ResponseHelper.success(
    res,
    HTTP_STATUS.OK,
    MESSAGES.SELLER_PROFILE.ACTIVATED,
    activatedProfile
  );
});

  /**
   * Hard delete seller profile (admin only)
   */
  hardDeleteProfile = asyncHandler(async (req, res) => {
    const { profileId } = req.params;

    logger.info(`💥 Hard deleting seller profile: ${profileId}`);

    const deletedInfo = await sellerProfileService.hardDeleteProfile(profileId);

    if (!deletedInfo) {
      return ResponseHelper.notFound(res, MESSAGES.SELLER_PROFILE.NOT_FOUND);
    }

    logger.info(`✅ Seller profile hard deleted: ${deletedInfo.storeName}`);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.HARD_DELETED
    );
  });

  /**
   * Activate seller profile
   */
  activateProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;

    logger.info(`🔄 Activating seller profile for user: ${userId}`);

    const activatedProfile = await sellerProfileService.activateProfile(userId);

    if (!activatedProfile) {
      return ResponseHelper.notFound(
        res,
        "No deactivated profile found to activate"
      );
    }

    logger.info(`✅ Seller profile activated: ${activatedProfile.storeName}`);

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      MESSAGES.SELLER_PROFILE.ACTIVATED,
      activatedProfile
    );
  });

  /**
   * Get public seller profile by slug
   */
  getPublicProfile = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const {
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortOrder = -1,
    } = req.query;

    logger.info(`👀 Getting public seller profile: ${slug}`);

    const publicProfile = await sellerProfileService.getPublicProfile(slug, {
      page,
      limit,
      sortBy,
      sortOrder,
    });

    if (!publicProfile) {
      return ResponseHelper.notFound(res, MESSAGES.STORE.NOT_FOUND);
    }

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Store information retrieved successfully",
      publicProfile
    );
  });

  /**
   * Get all active stores (public)
   */
  getAllStores = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 12,
      search,
      city,
      sortBy = "createdAt",
      sortOrder = -1,
    } = req.query;

    logger.info(`🏪 Getting all active stores - Page: ${page}`);

    const storesData = await sellerProfileService.getAllActiveStores({
      page,
      limit,
      search,
      city,
      sortBy,
      sortOrder,
    });

    return ResponseHelper.success(
      res,
      HTTP_STATUS.OK,
      "Stores retrieved successfully",
      storesData
    );
  });
}

// Export controller methods
const controller = new SellerProfileController();

module.exports = {
  createProfile: controller.createProfile,
  getProfile: controller.getProfile,
  updateProfile: controller.updateProfile,
  uploadStoreImage: controller.uploadStoreImage,
  archiveProfile: controller.archiveProfile,
  restoreProfile: controller.restoreProfile,
  softDeleteProfile: controller.softDeleteProfile,
  adminSoftDeleteProfile: controller.adminSoftDeleteProfile, // ← TAMBAH INI
  getAdminProfileDetail: controller.getAdminProfileDetail, // TAMBAH INI
  adminActivateProfile: controller.adminActivateProfile,
  activateProfile: controller.activateProfile,
  hardDeleteProfile: controller.hardDeleteProfile,
  getPublicProfile: controller.getPublicProfile,
  getAllStores: controller.getAllStores,
};
