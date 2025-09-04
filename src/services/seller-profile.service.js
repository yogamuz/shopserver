// seller-profile.service.js - REFACTORED TO CLASS-BASED VERSION
const SellerProfile = require("../models/seller-profile.model");
const Product = require("../models/products.model");
const User = require("../models/user.model");
const slugify = require("../utils/slugify");
const imageUploader = require("../utils/cloudinary-uploader.util");

class SellerProfileService {
  /**
   * Find seller profile by userId
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Seller profile or null
   */
  static async findByUserId(userId) {
    const profile = await SellerProfile.findOne({
      userId,
      // FIX: Ubah kondisi deletedAt untuk include null dan undefined
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });

    return profile;
  }

  /**
   * Find seller profile by slug
   * @param {string} slug - Store slug
   * @returns {Promise<Object|null>} Seller profile or null
   */
  static async findBySlug(slug) {
    return await SellerProfile.findBySlug(slug);
  }

  /**
   * Check if seller profile already exists
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if exists, false otherwise
   */
  static async profileExists(userId) {
    const existingProfile = await SellerProfile.findOne({ userId });
    return !!existingProfile;
  }

  /**
   * Verify if user exists and is active
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  static async verifyUser(userId) {
    const user = await User.findById(userId);
    return user && user.isActive ? user : null;
  }

  /**
   * Create new seller profile
   * @param {Object} profileData - Profile data
   * @returns {Promise<Object>} Created seller profile
   */
  static async createProfile(profileData) {
    const { userId, storeName, description, address, contact } = profileData;

    // Generate unique slug
    const storeSlug = await slugify.createUniqueSlug(
      storeName,
      "SellerProfile"
    );

    // Create seller profile
    const sellerProfile = new SellerProfile({
      userId,
      storeName,
      storeSlug,
      description,
      address,
      contact,
    });

    await sellerProfile.save();
    await sellerProfile.populate("userId", "username email");

    return sellerProfile;
  }

  /**
   * Get seller profile with stats
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Seller profile with stats
   */
  static async getProfileWithStats(userId) {
    const sellerProfile = await SellerProfile.findOne({
      userId,
      deletedAt: null,
    })
      .populate("userId", "username email createdAt")
      .populate("activeProductsCount");

    if (!sellerProfile) {
      return null;
    }

    // Get additional stats
    const totalProducts = await sellerProfile.getTotalProductsCount();
    const activeProducts = await sellerProfile.getActiveProductsCount();

    return {
      ...sellerProfile.toJSON(),
      stats: {
        totalProducts,
        activeProducts,
      },
    };
  }

  /**
   * Update seller profile
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated seller profile
   */
  static async updateProfile(userId, updates) {
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile) {
      return null;
    }

    // FIX: Update slug if storeName changed
    if (updates.storeName) {
      const currentStoreName = sellerProfile.storeName;
      const newStoreName = updates.storeName.trim();

      if (newStoreName !== currentStoreName) {
        // Generate new unique slug
        const newSlug = await slugify.createUniqueSlug(
          newStoreName,
          "SellerProfile",
          "storeSlug",
          sellerProfile._id
        );
        updates.storeSlug = newSlug;
      }
    }

    // Apply updates
    Object.keys(updates).forEach((key) => {
      if (key !== "userId" && key !== "_id") {
        sellerProfile[key] = updates[key];
      }
    });

    await sellerProfile.save();
    await sellerProfile.populate("userId", "username email");

    return sellerProfile;
  }

  /**
   * Upload store image
   * @param {string} userId - User ID
   * @param {string} imageType - Image type ('logo' or 'banner')
   * @param {Object} file - Uploaded file
   * @returns {Promise<Object>} Upload result
   */
static async uploadStoreImage(userId, imageType, file) {
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile) {
      return { success: false, message: "Seller profile not found" };
    }

    // Configuration based on image type
    const uploadOptions = {
      folder: `ecommerce/sellers/${sellerProfile._id}/${imageType}`,
      maxSize: imageType === "logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024, // 2MB for logo, 5MB for banner
      dimensions:
        imageType === "logo"
          ? { width: 400, height: 400 }
          : { width: 1200, height: 400 },
      format: 'webp',
    };

    // Upload new image to Cloudinary
    const uploadResult = await imageUploader.uploadImage(file, uploadOptions);

    if (!uploadResult.success) {
      return uploadResult;
    }

    // Delete old image from Cloudinary if exists
    if (sellerProfile[imageType]) {
      const deleteResult = await imageUploader.deleteImage(sellerProfile[imageType]);
      if (deleteResult.success) {
        logger.info(`Old ${imageType} deleted from Cloudinary: ${sellerProfile.storeName}`);
      } else {
        logger.warn(`Failed to delete old ${imageType}: ${deleteResult.message}`);
      }
    }

    // Update profile with new Cloudinary URL
    sellerProfile[imageType] = uploadResult.imageUrl;
    await sellerProfile.save();

    logger.info(`${imageType} uploaded to Cloudinary: ${sellerProfile.storeName}`);
    logger.info(`Cloudinary URL: ${uploadResult.imageUrl}`);

    return {
      success: true,
      imageUrl: uploadResult.imageUrl,
      publicId: uploadResult.publicId,
      cloudinaryData: uploadResult.cloudinaryData,
      storeName: sellerProfile.storeName,
    };
  }

  /**
   * Archive seller profile and deactivate products
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Archived seller profile
   */
  static async archiveProfile(userId) {
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile) {
      return null;
    }

    await sellerProfile.archive();

    // Also deactivate all products
    await Product.updateMany(
      { sellerId: sellerProfile._id },
      { isActive: false }
    );

    return sellerProfile;
  }

  /**
   * Restore seller profile
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Restored seller profile
   */
  static async restoreProfile(userId) {
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile) {
      return null;
    }

    await sellerProfile.restore();
    return sellerProfile;
  }

  /**
   * Soft delete seller profile and products
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Soft deleted seller profile
   */
  static async softDeleteProfile(userId) {
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile) {
      return null;
    }

    await sellerProfile.softDelete();

    // Soft delete all products
    await Product.updateMany(
      { sellerId: sellerProfile._id },
      { isActive: false, deletedAt: new Date() }
    );

    return sellerProfile;
  }

  /**
   * Admin soft delete seller profile by profileId
   * @param {string} profileId - Profile ID
   * @returns {Promise<Object|null>} Soft deleted seller profile
   */
  static async adminSoftDeleteProfile(profileId) {
    const sellerProfile = await SellerProfile.findById(profileId);

    if (!sellerProfile) {
      return null;
    }

    await sellerProfile.softDelete();

    // Soft delete all products
    await Product.updateMany(
      { sellerId: sellerProfile._id },
      { isActive: false, deletedAt: new Date() }
    );

    return sellerProfile;
  }

  /**
   * Admin activate seller profile by profileId
   * @param {string} profileId - Profile ID
   * @returns {Promise<Object|null>} Activated seller profile
   */
  static async adminActivateProfile(profileId) {
    // Find profile including soft deleted ones
    const sellerProfile = await SellerProfile.findOne({
      _id: profileId,
      deletedAt: { $ne: null }, // Only find soft deleted profiles
    });

    if (!sellerProfile) {
      return null;
    }

    // Restore profile
    sellerProfile.deletedAt = null;
    sellerProfile.status = "active";
    sellerProfile.isArchived = false;

    await sellerProfile.save();
    await sellerProfile.populate("userId", "username email");

    // Also reactivate products if needed
    await Product.updateMany(
      { sellerId: sellerProfile._id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: "" }, isActive: true }
    );

    return sellerProfile;
  }

  /**
   * Get seller profile by profileId (for admin)
   * @param {string} profileId - Profile ID
   * @returns {Promise<Object|null>} Seller profile with stats
   */
  static async getProfileById(profileId) {
    const sellerProfile = await SellerProfile.findById(profileId)
      .populate("userId", "username email createdAt")
      .populate("activeProductsCount");

    if (!sellerProfile) {
      return null;
    }

    // Get additional stats
    const totalProducts = await sellerProfile.getTotalProductsCount();
    const activeProducts = await sellerProfile.getActiveProductsCount();

    return {
      ...sellerProfile.toJSON(),
      stats: {
        totalProducts,
        activeProducts,
      },
    };
  }

  /**
   * Hard delete seller profile and products (admin only)
   * @param {string} profileId - Profile ID
   * @returns {Promise<Object|null>} Deleted seller profile info
   */
  static async hardDeleteProfile(profileId) {
    const sellerProfile = await SellerProfile.findById(profileId);

    if (!sellerProfile) {
      return null;
    }

    const storeName = sellerProfile.storeName;

    // Hard delete all products first
    await Product.deleteMany({ sellerId: sellerProfile._id });

    // Hard delete profile
    await SellerProfile.findByIdAndDelete(profileId);

    return { storeName };
  }

  /**
   * Activate seller profile (restore from soft delete)
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Activated seller profile
   */
  static async activateProfile(userId) {
    // Find profile including soft deleted ones
    const sellerProfile = await SellerProfile.findOne({
      userId,
      deletedAt: { $ne: null }, // Only find soft deleted profiles
    });

    if (!sellerProfile) {
      return null;
    }

    // Restore profile
    sellerProfile.deletedAt = null;
    sellerProfile.status = "active";
    sellerProfile.isArchived = false;

    await sellerProfile.save();
    await sellerProfile.populate("userId", "username email");

    // Also reactivate products if needed
    await Product.updateMany(
      { sellerId: sellerProfile._id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: "" }, isActive: true }
    );

    return sellerProfile;
  }

  /**
   * Get public seller profile with products
   * @param {string} slug - Store slug
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} Public profile with products
   */
  static async getPublicProfile(slug, options = {}) {
    const {
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortOrder = -1,
    } = options;

    const sellerProfile = await SellerProfileService.findBySlug(slug);

    if (!sellerProfile) {
      return null;
    }

    // Get paginated products
    const products = await sellerProfile.getActiveProducts({
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder: parseInt(sortOrder),
    });

    // Get stats
    const totalProducts = await sellerProfile.getTotalProductsCount();
    const activeProducts = await sellerProfile.getActiveProductsCount();

    return {
      store: sellerProfile,
      products: {
        data: products,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(activeProducts / parseInt(limit)),
          totalItems: activeProducts,
          itemsPerPage: parseInt(limit),
        },
      },
      stats: {
        totalProducts,
        activeProducts,
      },
    };
  }

  /**
   * Get all active stores with pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Stores with pagination
   */
  static async getAllActiveStores(options = {}) {
    const {
      page = 1,
      limit = 12,
      search,
      city,
      sortBy = "createdAt",
      sortOrder = -1,
    } = options;

    const stores = await SellerProfile.findActiveStores({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      city,
      sortBy,
      sortOrder: parseInt(sortOrder),
    });

    const totalStores = await SellerProfile.countDocuments({
      status: "active",
      isArchived: false,
      deletedAt: null,
    });

    return {
      stores,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalStores / parseInt(limit)),
        totalItems: totalStores,
        itemsPerPage: parseInt(limit),
      },
    };
  }
}

module.exports = SellerProfileService;