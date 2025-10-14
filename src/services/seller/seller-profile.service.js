// seller-profile.service.js - SELLER FOCUSED PROFILE OPERATIONS
const SellerProfile = require("../../models/seller-profile.model");
const Product = require("../../models/products.model");
const User = require("../../models/user.model");
const slugify = require("../../utils/slugify");
const imageUploader = require("../../utils/cloudinary-uploader.util");
const logger = require("../../utils/logger");

/**
 * Seller Profile Service
 * Handles SELLER FOCUSED operations for seller profiles
 */
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
  /**
   * Create new seller profile
   * @param {Object} profileData - Profile data
   * @returns {Promise<Object>} Clean created seller profile
   */
  static async createProfile(profileData) {
    const { userId, storeName, description, address, contact } = profileData;

    // Generate unique slug
    const storeSlug = await slugify.createUniqueSlug(storeName, "SellerProfile");

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
    await sellerProfile.populate("userId", "username email createdAt");

    // Transform to clean response format
    return {
      id: sellerProfile._id.toString(),
      userId: sellerProfile.userId._id.toString(),
      storeName: sellerProfile.storeName,
      storeSlug: sellerProfile.storeSlug,
      description: sellerProfile.description || "",
      logo: sellerProfile.logo || null,
      banner: sellerProfile.banner || null,
      status: sellerProfile.status,
      owner: {
        id: sellerProfile.userId._id.toString(),
        username: sellerProfile.userId.username,
        email: sellerProfile.userId.email,
        joinedAt: sellerProfile.userId.createdAt,
      },
      address: {
        street: sellerProfile.address?.street || "",
        city: sellerProfile.address?.city || "",
        province: sellerProfile.address?.province || "",
        postalCode: sellerProfile.address?.postalCode || "",
        country: sellerProfile.address?.country || "Indonesia",
      },
      contact: {
        phone: sellerProfile.contact?.phone || "",
        email: sellerProfile.contact?.email || "",
        socialLinks: sellerProfile.contact?.socialLinks || [],
      },
      stats: {
        totalProducts: 0,
        activeProducts: 0,
        inactiveProducts: 0,
      },
      createdAt: sellerProfile.createdAt,
      updatedAt: sellerProfile.updatedAt,
    };
  }

  /**
   * Get seller profile with stats
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Clean seller profile with stats
   */
  static async getProfileWithStats(userId) {
    if (!userId) {
      logger.error("❌ getProfileWithStats called with undefined userId");
      return null;
    }

    logger.info("🔍 Getting profile for userId:", userId);

    const sellerProfile = await SellerProfile.findOne({
      userId,
      deletedAt: null,
    }).populate("userId", "username email createdAt");

    if (!sellerProfile) {
      return null;
    }
    // ✅ Extract userId FIRST (before any logging)
    const userIdValue = sellerProfile.userId?._id
      ? sellerProfile.userId._id.toString()
      : typeof sellerProfile.userId === "string"
      ? sellerProfile.userId
      : String(sellerProfile.userId || "");

    // ✅ NOW safe to log
    logger.info("📌 Populated userId:", userIdValue);
    logger.info("📌 Populate success:", !!sellerProfile.userId._id);

    const [totalProducts, activeProducts] = await Promise.all([
      Product.countDocuments({ sellerId: sellerProfile._id }),
      Product.countDocuments({ sellerId: sellerProfile._id, isActive: true }),
    ]);

    const ownerData = sellerProfile.userId?._id
      ? {
          id: sellerProfile.userId._id.toString(),
          username: sellerProfile.userId.username,
          email: sellerProfile.userId.email,
          joinedAt: sellerProfile.userId.createdAt,
        }
      : null;

    return {
      id: sellerProfile._id.toString(),
      userId: userIdValue, // ← Harus ada nilai
      storeName: sellerProfile.storeName,
      storeSlug: sellerProfile.storeSlug,
      description: sellerProfile.description || "",
      logo: sellerProfile.logo || null,
      banner: sellerProfile.banner || null,
      status: sellerProfile.status,
      owner: ownerData,
      address: {
        street: sellerProfile.address?.street || "",
        city: sellerProfile.address?.city || "",
        province: sellerProfile.address?.province || "",
        postalCode: sellerProfile.address?.postalCode || "",
        country: sellerProfile.address?.country || "Indonesia",
      },
      contact: {
        phone: sellerProfile.contact?.phone || "",
        email: sellerProfile.contact?.email || "",
        socialLinks: (sellerProfile.contact?.socialLinks || []).map(link => ({
          platform: link.platform,
          url: link.url,
        })),
      },
      stats: {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
      },
      createdAt: sellerProfile.createdAt,
      updatedAt: sellerProfile.updatedAt,
    };
  }

  /**
   * Update seller profile (Nested structure only)
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Clean updated seller profile
   */

  static async updateProfile(userId, updates) {
    const sellerProfile = await SellerProfileService.findByUserId(userId);

    if (!sellerProfile) {
      return null;
    }

    // Update slug if storeName changed
    if (updates.storeName) {
      const currentStoreName = sellerProfile.storeName;
      const newStoreName = updates.storeName.trim();

      if (newStoreName !== currentStoreName) {
        const newSlug = await slugify.createUniqueSlug(newStoreName, "SellerProfile", "storeSlug", sellerProfile._id);
        updates.storeSlug = newSlug;
      }
    }

    // ✅ FIX: Handle nested objects properly
    Object.keys(updates).forEach(key => {
      if (key !== "userId" && key !== "_id") {
        if (key === "address") {
          // Merge address
          sellerProfile.address = {
            ...(sellerProfile.address?.toObject?.() || sellerProfile.address || {}),
            ...updates.address,
          };
        } else if (key === "contact") {
          // ✅ CRITICAL: Handle contact with socialLinks array
          const existingContact = sellerProfile.contact?.toObject?.() || sellerProfile.contact || {};

          sellerProfile.contact = {
            phone: updates.contact.phone !== undefined ? updates.contact.phone : existingContact.phone,
            email: updates.contact.email !== undefined ? updates.contact.email : existingContact.email,
            // ✅ Replace socialLinks entirely (array can't be merged)
            socialLinks:
              updates.contact.socialLinks !== undefined
                ? updates.contact.socialLinks
                : existingContact.socialLinks || [],
          };
        } else {
          sellerProfile[key] = updates[key];
        }
      }
    });

    await sellerProfile.save();
    await sellerProfile.populate("userId", "username email createdAt");

    // Get current stats
    const [totalProducts, activeProducts] = await Promise.all([
      Product.countDocuments({ sellerId: sellerProfile._id }),
      Product.countDocuments({ sellerId: sellerProfile._id, isActive: true }),
    ]);

    // Return clean response
    return {
      id: sellerProfile._id.toString(),
      userId: sellerProfile.userId._id.toString(),
      storeName: sellerProfile.storeName,
      storeSlug: sellerProfile.storeSlug,
      description: sellerProfile.description || "",
      logo: sellerProfile.logo || null,
      banner: sellerProfile.banner || null,
      status: sellerProfile.status,
      owner: {
        id: sellerProfile.userId._id.toString(),
        username: sellerProfile.userId.username,
        email: sellerProfile.userId.email,
        joinedAt: sellerProfile.userId.createdAt,
      },
      address: {
        street: sellerProfile.address?.street || "",
        city: sellerProfile.address?.city || "",
        province: sellerProfile.address?.province || "",
        postalCode: sellerProfile.address?.postalCode || "",
        country: sellerProfile.address?.country || "Indonesia",
      },
      contact: {
        phone: sellerProfile.contact?.phone || "",
        email: sellerProfile.contact?.email || "",
        socialLinks: sellerProfile.contact?.socialLinks || [], // ✅ Ensure array returned
      },
      stats: {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
      },
      createdAt: sellerProfile.createdAt,
      updatedAt: sellerProfile.updatedAt,
    };
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

    const uploadOptions = {
      folder: `ecommerce/sellers/${sellerProfile._id}/${imageType}`,
      maxSize: imageType === "logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024,
      dimensions: imageType === "logo" ? { width: 400, height: 400 } : { width: 1200, height: 400 },
      format: "webp",
    };

    const uploadResult = await imageUploader.uploadImage(file, uploadOptions);

    if (!uploadResult.success) {
      return uploadResult;
    }

    if (sellerProfile[imageType]) {
      const deleteResult = await imageUploader.deleteImage(sellerProfile[imageType]);
      if (deleteResult.success) {
        logger.info(`Old ${imageType} deleted from Cloudinary: ${sellerProfile.storeName}`);
      }
    }

    sellerProfile[imageType] = uploadResult.imageUrl;
    await sellerProfile.save();

    // ✅ FIX: Populate dan return full profile seperti getProfileWithStats
    await sellerProfile.populate("userId", "username email createdAt");

    // Get stats
    const [totalProducts, activeProducts] = await Promise.all([
      Product.countDocuments({ sellerId: sellerProfile._id }),
      Product.countDocuments({ sellerId: sellerProfile._id, isActive: true }),
    ]);

    // ✅ Return langsung tanpa wrapping 'profile' key
    return {
      id: sellerProfile._id.toString(),
      userId: sellerProfile.userId._id.toString(),
      storeName: sellerProfile.storeName,
      storeSlug: sellerProfile.storeSlug,
      description: sellerProfile.description || "",
      logo: sellerProfile.logo || null,
      banner: sellerProfile.banner || null,
      status: sellerProfile.status,
      owner: {
        id: sellerProfile.userId._id.toString(),
        username: sellerProfile.userId.username,
        email: sellerProfile.userId.email,
        joinedAt: sellerProfile.userId.createdAt,
      },
      address: {
        street: sellerProfile.address?.street || "",
        city: sellerProfile.address?.city || "",
        province: sellerProfile.address?.province || "",
        postalCode: sellerProfile.address?.postalCode || "",
        country: sellerProfile.address?.country || "Indonesia",
      },
      contact: {
        phone: sellerProfile.contact?.phone || "",
        email: sellerProfile.contact?.email || "",
        socialLinks: sellerProfile.contact?.socialLinks || [],
      },
      stats: {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
      },
      createdAt: sellerProfile.createdAt,
      updatedAt: sellerProfile.updatedAt,
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
    await Product.updateMany({ sellerId: sellerProfile._id }, { isActive: false });

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

    // ✅ TAMBAH: Reactivate all products yang tadinya inactive karena archive
    await Product.updateMany({ sellerId: sellerProfile._id, isActive: false }, { isActive: true });

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
    await Product.updateMany({ sellerId: sellerProfile._id }, { isActive: false, deletedAt: new Date() });

    return sellerProfile;
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
  static async getPublicProfile(slug) {
    const sellerProfile = await SellerProfileService.findBySlug(slug);

    if (!sellerProfile) {
      return null;
    }

    // Get stats only
    const totalProducts = await sellerProfile.getTotalProductsCount();
    const activeProducts = await sellerProfile.getActiveProductsCount();

    // Transform store data to clean format - NO PRODUCTS
    return {
      id: sellerProfile._id.toString(),
      userId: sellerProfile.userId._id.toString(),
      name: sellerProfile.storeName,
      slug: sellerProfile.storeSlug,
      description: sellerProfile.description || "",
      status: sellerProfile.status,
      images: {
        logo: sellerProfile.logo || null,
        banner: sellerProfile.banner || null,
      },
      owner: {
        id: sellerProfile.userId?._id?.toString() || "",
        username: sellerProfile.userId?.username || "",
        joinedAt: sellerProfile.userId?.createdAt || null,
      },
      location: {
        city: sellerProfile.address?.city || "",
        province: sellerProfile.address?.province || "",
        country: sellerProfile.address?.country || "Indonesia",
      },
      contact: {
        phone: sellerProfile.contact?.phone || "",
        social: (sellerProfile.contact?.socialLinks || []).reduce((acc, link) => {
          if (link.platform && link.url) {
            acc[link.platform] = link.url;
          }
          return acc;
        }, {}),
      },
      stats: {
        products: totalProducts, // ✅ Return number langsung
        reviews: 0, // Placeholder, nanti diisi dari review stats
        rating: 0, // Placeholder, nanti diisi dari review stats
      },
      timestamps: {
        created: sellerProfile.createdAt,
        updated: sellerProfile.updatedAt,
      },
    };
  }

  /**
   * Get all active stores with pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Stores with pagination
   */

  static async getAllActiveStores(options = {}) {
    const { page = 1, limit = 12, search, city, sortBy = "createdAt", sortOrder = -1 } = options;

    // Get stores with pagination
    const stores = await SellerProfile.findActiveStores({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      city,
      sortBy,
      sortOrder: parseInt(sortOrder),
    });

    // Get total count for pagination
    const totalStores = await SellerProfile.countDocuments({
      status: "active",
      isArchived: false,
      deletedAt: null,
    });

    // Transform stores to match desired response structure
    const transformedStores = stores.map(store => {
      const safeAddress = store.address || {};
      const safeContact = store.contact || {};
      const safeStats = store.stats || {};
      const safeOwner = store.userId || {}; // Assuming owner info is in userId

      // Transform social links from array to object
      const socialLinks = safeContact.socialLinks || [];
      const social = {};

      socialLinks.forEach(link => {
        if (link.platform && link.url) {
          social[link.platform] = link.url;
        }
      });

      return {
        id: store._id.toString(),
        name: store.storeName,
        slug: store.storeSlug,
        description: store.description,
        status: store.status,
        images: {
          logo: store.logo,
          banner: store.banner,
        },
        owner: {
          id: safeOwner._id ? safeOwner._id.toString() : null,
          username: safeOwner.username,
        },
        location: {
          city: safeAddress.city,
          province: safeAddress.province,
          country: safeAddress.country || "Indonesia",
          fullAddress: [
            safeAddress.street,
            safeAddress.city,
            safeAddress.province,
            safeAddress.postalCode,
            safeAddress.country || "Indonesia",
          ]
            .filter(Boolean)
            .join(", "),
        },
        contact: {
          phone: safeContact.phone,
          social: social,
        },
        stats: {
          products: safeStats.totalProducts || 0,
          reviews: safeStats.totalReviews || 0,
          rating: safeStats.averageRating || 0,
        },
        timestamps: {
          created: store.createdAt,
          updated: store.updatedAt,
        },
      };
    });

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return {
      stores: transformedStores,
      meta: {
        pagination: {
          page: parsedPage,
          pages: Math.ceil(totalStores / parsedLimit),
          total: totalStores,
          limit: parsedLimit,
        },
        filters: {
          city: city || null,
          search: search || null,
        },
      },
    };
  }
}

module.exports = SellerProfileService;
