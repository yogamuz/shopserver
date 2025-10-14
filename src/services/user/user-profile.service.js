// services/user/user-profile.service.js
const Profile = require("../../models/profile.model");
const User = require("../../models/user.model");
const { uploadImage, deleteImage } = require("../../utils/cloudinary-uploader.util");
const { HTTP_STATUS, MESSAGES } = require("../../constants/httpStatus");
const logger = require("../../utils/logger");
const ProfileHelper = require("../../utils/user-profile.helper");

class UserProfileService {
  /**
   * Create user profile with enhanced address support
   */
  static async createProfile(userId, profileData) {
    try {
      logger.info("Checking for existing profile for user:", userId);

      // Check if profile already exists
      const existingProfile = await Profile.findOne({ user: userId });
      if (existingProfile) {
        logger.warn("Profile already exists for user:", userId);
        throw new Error(MESSAGES.PROFILE.USE_PUT_TO_UPDATE);
      }

      // Build processed profile data using helper
      const processedProfileData = ProfileHelper.buildProfileData(userId, profileData);

      logger.info("Creating profile with processed data:", ProfileHelper.sanitizeForLogging(profileData));

      // Create new profile
      const profile = await Profile.create(processedProfileData);

      // Populate and return response
      const populatedProfile = await Profile.findById(profile._id).populate("user", "username email role").lean();

      if (!populatedProfile) {
        throw new Error("Profile created but failed to retrieve");
      }

      logger.info("Profile created successfully for user:", userId);

      return {
        success: true,
        message: MESSAGES.PROFILE.CREATED,
        data: ProfileHelper.formatProfileResponse(populatedProfile),
      };
    } catch (error) {
      logger.error("Error in createProfile service:", {
        error: error.message,
        userId,
        profileDataKeys: Object.keys(profileData),
      });

      // Handle specific MongoDB errors
      if (error.code === 11000) {
        throw new Error(MESSAGES.PROFILE.ALREADY_EXISTS);
      }

      if (error.name === "ValidationError") {
        const validationMessages = Object.values(error.errors).map(err => err.message);
        throw new Error(`Validation failed: ${validationMessages.join(", ")}`);
      }

      if (error.name === "CastError") {
        throw new Error("Invalid data format provided");
      }

      // Re-throw known custom errors
      if (
        error.message === MESSAGES.PROFILE.USE_PUT_TO_UPDATE ||
        error.message.includes("Validation failed:") ||
        error.message.includes("Invalid data format")
      ) {
        throw error;
      }

      // Generic error for unknown issues
      throw new Error(MESSAGES.PROFILE.CREATE_FAILED);
    }
  }

  /**
   * Update user profile data with enhanced address handling
   */
  static async updateProfile(userId, profileData) {
    try {
      logger.info("Updating profile for user:", userId);

      let profile = await Profile.findOne({ user: userId });

      if (!profile) {
        // Create new profile if doesn't exist
        logger.info("Profile not found, creating new one");
        return await this.createProfile(userId, profileData);
      }

      // Handle address updates using helper
      if (profileData.address || profileData.addresses) {
        const newAddresses = ProfileHelper.processAddresses(profileData);
        if (newAddresses.length > 0) {
          profile.addresses = newAddresses;
          // Update backward compatibility field
          profile.address = ProfileHelper.generateAddressString(newAddresses[0]);
        }
      }

      // Update other fields
      ["firstName", "lastName", "phone", "avatar", "gender"].forEach(field => {
        if (profileData[field] !== undefined) {
          profile[field] = profileData[field];
        }
      });

      if (profileData.dateOfBirth) {
        profile.dateOfBirth = new Date(profileData.dateOfBirth);
      }

      await profile.save();

      // Get updated profile with clean response
      const updatedProfile = await Profile.findById(profile._id)
        .populate("user", "username email role isActive createdAt updatedAt")
        .lean();

      logger.info("Profile updated successfully for user:", userId);

      return {
        success: true,
        message: MESSAGES.PROFILE.UPDATED,
        data: ProfileHelper.formatProfileResponse(updatedProfile),
      };
    } catch (error) {
      logger.error("Error updating profile:", error);

      if (error.name === "ValidationError") {
        const validationMessages = Object.values(error.errors).map(err => err.message);
        throw new Error(`Validation failed: ${validationMessages.join(", ")}`);
      }

      throw new Error(MESSAGES.PROFILE.UPDATE_FAILED);
    }
  }

  /**
   * Get user data with profile (helper for controller)
   */
  static async getUserWithProfile(userId) {
    try {
      // Get user data
      const user = await User.findById(userId).select("-password").lean();

      if (!user) {
        return {
          success: false,
          data: null,
        };
      }

      // Clean user object - remove MongoDB fields
      const cleanUser = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Get profile data if exists
      const profile = await Profile.findOne({ user: userId }).lean();

      let cleanProfile = null;
      if (profile) {
        // Use helper to format profile response
        cleanProfile = ProfileHelper.formatProfileResponse({
          ...profile,
          user: user, // Pass user data for population
        });
      }

      return {
        success: true,
        data: {
          user: cleanUser,
          profile: cleanProfile,
        },
      };
    } catch (error) {
      logger.error("Error in getUserWithProfile:", error);
      throw error;
    }
  }

  // Upload avatar
  // Upload avatar
  static async uploadAvatar(userId, file) {
    try {
      if (!file) {
        throw new Error(MESSAGES.PROFILE.AVATAR_FILE_REQUIRED);
      }

      // Get existing profile to check for old avatar
      const existingProfile = await Profile.findOne({ user: userId });
      const oldAvatarUrl = existingProfile?.avatar;

      // Upload new avatar to Cloudinary with specific config for avatars
      const uploadConfig = {
        folder: `ecommerce/avatars/${userId}`,
        dimensions: { width: 300, height: 300 },
        quality: 85,
        format: "webp",
        maxSize: 3 * 1024 * 1024, // 3MB
      };

      const uploadResult = await uploadImage(file, uploadConfig);

      if (!uploadResult.success) {
        // Handle specific upload errors
        if (uploadResult.message.includes("Invalid file type")) {
          throw new Error(MESSAGES.PROFILE.INVALID_IMAGE_TYPE);
        }
        if (uploadResult.message.includes("too large")) {
          throw new Error(MESSAGES.PROFILE.AVATAR_TOO_LARGE);
        }
        throw new Error(MESSAGES.PROFILE.AVATAR_UPLOAD_FAILED);
      }

      // Update profile with new avatar URL
      const updatedProfile = await Profile.findOneAndUpdate(
        { user: userId },
        { avatar: uploadResult.imageUrl },
        {
          new: true,
          runValidators: true,
          upsert: true,
        }
      ).populate("user", "username email role");

      // Delete old avatar from Cloudinary if exists
      if (oldAvatarUrl && oldAvatarUrl !== uploadResult.imageUrl) {
        try {
          const deleteResult = await deleteImage(oldAvatarUrl);
          if (deleteResult.success) {
            logger.info(`Old avatar deleted from Cloudinary: ${oldAvatarUrl}`);
          } else {
            logger.warn(`Failed to delete old avatar: ${deleteResult.message}`);
          }
        } catch (deleteError) {
          logger.warn(`Error deleting old avatar: ${deleteError.message}`);
        }
      }

      logger.info(`Avatar uploaded successfully for user: ${userId}`);

      // ✅ REVISI: Return structure yang konsisten dengan getProfile
      const formattedData = ProfileHelper.formatProfileResponse(updatedProfile, {
        includeUser: true,
        includeAllAddresses: false,
        includeMetadata: false,
        responseType: "avatar-update", // Custom response type for avatar update
      });

      return {
        success: true,
        message: MESSAGES.PROFILE.AVATAR_UPLOADED,
        data: formattedData, // Sekarang structure sama dengan getProfile
      };
    } catch (error) {
      logger.error("Error in uploadAvatar:", error);

      if (error.message.includes("PROFILE.")) {
        throw error;
      }

      throw new Error(MESSAGES.PROFILE.AVATAR_UPLOAD_FAILED);
    }
  }

  /**
   * Remove avatar from user profile
   */
  static async removeAvatar(userId) {
    try {
      const profile = await Profile.findOne({ user: userId });

      if (!profile || !profile.avatar) {
        throw new Error(MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE);
      }

      const oldAvatarUrl = profile.avatar;

      // Remove avatar from profile
      profile.avatar = null;
      await profile.save();

      // Delete image from Cloudinary
      try {
        const deleteResult = await deleteImage(oldAvatarUrl);
        if (deleteResult.success) {
          logger.info(`Avatar deleted from Cloudinary: ${oldAvatarUrl}`);
        } else {
          logger.warn(`Failed to delete avatar from Cloudinary: ${deleteResult.message}`);
        }
      } catch (deleteError) {
        logger.warn(`Error deleting avatar from Cloudinary: ${deleteError.message}`);
        // Don't throw error here, profile update was successful
      }

      // Get updated profile with user info
      const updatedProfile = await Profile.findById(profile._id).populate("user", "username email");

      logger.info(`Avatar removed successfully for user: ${userId}`);

      // Return clean, focused response for avatar removal
      return {
        success: true,
        message: MESSAGES.PROFILE.AVATAR_REMOVED,
        data: {
          id: updatedProfile._id.toString(),
          user: {
            id: updatedProfile.user._id.toString(),
            username: updatedProfile.user.username,
            email: updatedProfile.user.email,
          },
          profile: {
            firstName: updatedProfile.firstName,
            lastName: updatedProfile.lastName,
            fullName: `${updatedProfile.firstName || ""} ${updatedProfile.lastName || ""}`.trim(),
          },
          avatar: {
            url: null,
            removedAt: new Date().toISOString(),
            status: "removed",
          },
        },
      };
    } catch (error) {
      logger.error("Error in removeAvatar:", error);

      // If it's our custom error message, throw as is
      if (error.message === MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE) {
        throw error;
      }

      throw new Error(MESSAGES.PROFILE.AVATAR_REMOVE_FAILED);
    }
  }

  /**
   * Get user profile with avatar info
   */
  static async getProfile(userId) {
    try {
      const profile = await Profile.findOne({ user: userId }).populate(
        "user",
        "username email role createdAt updatedAt lastSeen"
      );

      if (!profile) {
        throw new Error("Profile not found");
      }

      const formattedData = ProfileHelper.formatProfileResponse(profile, {
        includeUser: true,
        includeAllAddresses: true,
        includeMetadata: true,
        responseType: "full",
      });

      return {
        success: true,
        data: formattedData,
        message: "Profile retrieved successfully",
      };
    } catch (error) {
      logger.error("Error getting profile:", error);
      throw new Error("Failed to get profile");
    }
  }

  // ============ ADDRESS MANAGEMENT METHODS ============

  /**
   * Get all user addresses
   */
  static async getAddresses(userId) {
    try {
      const profile = await Profile.findOne({ user: userId });

      if (!profile) {
        return {
          success: true,
          data: {
            id: null,
            addresses: {
              total: 0,
              default: null,
              list: [],
            },
          },
          message: "No addresses found",
        };
      }

      const formattedData = ProfileHelper.formatProfileResponse(profile, {
        includeUser: false,
        includeAllAddresses: true,
        responseType: "address-list",
      });

      return {
        success: true,
        data: formattedData,
        message: "Addresses retrieved successfully",
      };
    } catch (error) {
      logger.error("Error getting addresses:", error);
      throw new Error("Failed to get addresses");
    }
  }

  /**
   * Add new address to user profile
   */
  // Fixed addAddress method in UserProfileService
  static async addAddress(userId, addressData) {
    try {
      logger.info("Adding address for user:", userId, "with data:", addressData);

      let profile = await Profile.findOne({ user: userId });

      if (!profile) {
        // Create profile if doesn't exist with this address
        logger.info("Profile not found, creating new one with address");
        return await this.createProfile(userId, { addresses: [addressData] });
      }

      // Validate address data using helper (if ProfileHelper exists)
      if (ProfileHelper && ProfileHelper.validateAddress) {
        const validation = ProfileHelper.validateAddress(addressData);
        if (!validation.isValid) {
          throw new Error(`Address validation failed: ${validation.errors.join(", ")}`);
        }
      } else {
        // Basic validation if helper doesn't exist
        const requiredFields = ["street", "city", "state", "zipCode", "country"];
        const missingFields = requiredFields.filter(
          field => !addressData[field] || addressData[field].toString().trim() === ""
        );

        if (missingFields.length > 0) {
          throw new Error(`Address validation failed: Missing required fields: ${missingFields.join(", ")}`);
        }
      }

      // Initialize addresses array if it doesn't exist
      if (!profile.addresses) {
        profile.addresses = [];
      }

      // Create address object with proper label format (capitalize first letter)
      const labelMap = {
        home: "Home",
        work: "Office",
        office: "Office",
        other: "Other",
      };

      const normalizedLabel = addressData.label ? labelMap[addressData.label.toLowerCase()] || "Home" : "Home";

      const newAddress = {
        name: addressData.name ? addressData.name.trim() : "",
        street: addressData.street.trim(),
        city: addressData.city.trim(),
        state: addressData.state.trim(),
        zipCode: addressData.zipCode.trim(),
        country: (addressData.country || "Indonesia").trim(),
        label: normalizedLabel,
        isDefault: profile.addresses.length === 0 || addressData.isDefault === true,
      };

      // If this is set as default, make others non-default
      if (newAddress.isDefault) {
        profile.addresses.forEach(addr => {
          addr.isDefault = false;
        });
      }

      // Add address to profile
      profile.addresses.push(newAddress);

      // Update backward compatibility address field
      if (newAddress.isDefault) {
        profile.address = `${newAddress.street}, ${newAddress.city}, ${newAddress.state} ${newAddress.zipCode}, ${newAddress.country}`;
      }

      // Save profile
      await profile.save();

      logger.info("Address added successfully for user:", userId);
      logger.info("Step 1: Starting addAddress");
      logger.info("Step 2: Profile found/created");
      logger.info("Step 3: Address validated");
      logger.info("Step 4: Address added to profile");
      logger.info("Step 5: Profile saved successfully");
      // Get updated profile
      const updatedProfile = await Profile.findById(profile._id).populate("user", "username email role");

      // Format response data
      const newAddressIndex = updatedProfile.addresses.length - 1;
      const formattedAddress = {
        index: newAddressIndex,
        street: newAddress.street,
        city: newAddress.city,
        state: newAddress.state,
        zipCode: newAddress.zipCode,
        country: newAddress.country,
        label: newAddress.label,
        isDefault: newAddress.isDefault,
        fullAddress: `${newAddress.street}, ${newAddress.city}, ${newAddress.state} ${newAddress.zipCode}, ${newAddress.country}`,
      };

      // Format clean response
      const formattedData = {
        id: updatedProfile._id.toString(),
        user: {
          id: updatedProfile.user._id.toString(),
          username: updatedProfile.user.username,
          email: updatedProfile.user.email,
        },
        newAddress: formattedAddress,
        addresses: {
          total: updatedProfile.addresses.length,
          default: formattedAddress.isDefault ? formattedAddress : null,
        },
      };

      return {
        success: true,
        data: formattedData,
        message: "Address added successfully",
      };
    } catch (error) {
      logger.error("Error adding address:", {
        errorMessage: error.message,
        errorStack: error.stack,
        userId: userId,
        addressData: addressData,
      });

      if (error.name === "ValidationError") {
        const validationMessages = Object.values(error.errors).map(err => err.message);
        throw new Error(`Validation failed: ${validationMessages.join(", ")}`);
      }

      // Re-throw custom validation errors
      if (error.message.includes("Address validation failed")) {
        throw error;
      }

      throw new Error("Failed to add address");
    }
  }
  static async updateAddress(userId, addressIndex, addressData) {
    try {
      const profile = await Profile.findOne({ user: userId });

      if (!profile) {
        throw new Error("Profile not found");
      }

      // Check if address index exists
      if (addressIndex < 0 || addressIndex >= profile.addresses.length) {
        throw new Error("Invalid address index");
      }

      // Validate only the fields that are being updated
      const fieldsToValidate = {};
      ["street", "city", "state", "zipCode"].forEach(field => {
        if (addressData[field] !== undefined) {
          fieldsToValidate[field] = addressData[field];
        }
      });

      // Only validate if there are required fields to update
      if (Object.keys(fieldsToValidate).length > 0) {
        // Get current address data and merge with updates for validation
        const currentAddress = profile.addresses[addressIndex];
        const mergedAddress = {
          street: addressData.street !== undefined ? addressData.street : currentAddress.street,
          city: addressData.city !== undefined ? addressData.city : currentAddress.city,
          state: addressData.state !== undefined ? addressData.state : currentAddress.state,
          zipCode: addressData.zipCode !== undefined ? addressData.zipCode : currentAddress.zipCode,
        };

        const validation = ProfileHelper.validateAddress(mergedAddress);
        if (!validation.isValid) {
          throw new Error(`Address validation failed: ${validation.errors.join(", ")}`);
        }
      }

      // Update address using model method
      await profile.updateAddress(addressIndex, addressData);

      // Get fresh data after update
      const updatedProfile = await Profile.findById(profile._id).populate("user", "username email role");

      // Format response specifically for address update
      const cleanAddresses = updatedProfile.addresses.map((addr, index) => ProfileHelper.formatAddress(addr, index));
      const defaultAddress = ProfileHelper.getDefaultAddress(cleanAddresses);

      const responseData = {
        id: updatedProfile._id.toString(),
        updatedAddress: cleanAddresses[addressIndex],
        addresses: {
          total: cleanAddresses.length,
          default: defaultAddress,
        },
      };

      return {
        success: true,
        data: responseData,
        message: "Address updated successfully",
      };
    } catch (error) {
      logger.error("Error updating address:", {
        errorMessage: error.message,
        userId: userId,
        addressIndex: addressIndex,
        addressData: ProfileHelper.sanitizeForLogging({ address: addressData }),
      });

      // Re-throw known errors
      if (
        error.message === "Profile not found" ||
        error.message === "Invalid address index" ||
        error.message.includes("Address validation failed")
      ) {
        throw error;
      }

      if (error.name === "ValidationError") {
        const validationMessages = Object.values(error.errors).map(err => err.message);
        throw new Error(`Validation failed: ${validationMessages.join(", ")}`);
      }

      throw new Error("Failed to update address");
    }
  }

  /**
   * Remove specific address by index
   */
  static async removeAddress(userId, addressIndex) {
    try {
      const profile = await Profile.findOne({ user: userId });

      if (!profile) {
        throw new Error("Profile not found");
      }

      // Check if address exists
      if (addressIndex < 0 || addressIndex >= profile.addresses.length) {
        throw new Error("Invalid address index");
      }

      // Store the address that will be removed for response
      const removedAddress = ProfileHelper.formatAddress(profile.addresses[addressIndex], addressIndex);

      // Use model method to remove address
      await profile.removeAddress(addressIndex);

      // Get updated profile with fresh data
      const updatedProfile = await Profile.findById(profile._id).populate("user", "username email");

      // Format clean addresses for response
      const cleanAddresses = updatedProfile.addresses.map((addr, index) => ProfileHelper.formatAddress(addr, index));
      const defaultAddress = ProfileHelper.getDefaultAddress(cleanAddresses);

      logger.info(`Address at index ${addressIndex} removed successfully for user: ${userId}`);

      // Return clean, focused response for address removal
      return {
        success: true,
        message: "Address removed successfully",
        data: {
          id: updatedProfile._id.toString(),
          removedAddress: {
            ...removedAddress,
            removedAt: new Date().toISOString(),
          },
          addresses: {
            total: cleanAddresses.length,
            default: defaultAddress,
            list: cleanAddresses,
          },
        },
      };
    } catch (error) {
      logger.error("Error removing address:", {
        errorMessage: error.message,
        userId: userId,
        addressIndex: addressIndex,
      });

      if (error.message === "Invalid address index" || error.message === "Profile not found") {
        throw error;
      }

      throw new Error("Failed to remove address");
    }
  }

  /**
   * Set specific address as default
   */
  static async setDefaultAddress(userId, addressIndex) {
    try {
      const profile = await Profile.findOne({ user: userId });

      if (!profile) {
        throw new Error("Profile not found");
      }

      // Use model method to set default address
      await profile.setDefaultAddress(addressIndex);

      const updatedProfile = await Profile.findById(profile._id).populate("user", "username email role");

      // Format clean response
      const formattedData = ProfileHelper.formatProfileResponse(updatedProfile, {
        includeUser: true,
        includeAllAddresses: true,
        responseType: "address-update",
      });

      return {
        success: true,
        data: formattedData,
        message: "Default address set successfully",
      };
    } catch (error) {
      logger.error("❌ Error setting default address:", error);

      if (error.message === "Invalid address index") {
        throw new Error("Invalid address index");
      }

      throw new Error("Failed to set default address");
    }
  }

  /**
   * Upgrade user role to seller and create seller profile
   */
  static async upgradeToSeller(userId, sellerData = {}) {
    try {
      logger.info("Processing seller upgrade for user:", userId);

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if already seller
      if (user.role === "seller") {
        throw new Error("User is already a seller");
      }

      if (user.role === "admin") {
        throw new Error("Admin cannot be upgraded to seller");
      }

      const SellerProfileService = require("../seller/seller-profile.service");

      // Check if seller profile already exists
      // Check if seller profile already exists
      const existingSellerProfile = await SellerProfileService.findByUserId(userId);
      if (existingSellerProfile) {
        logger.info("Seller profile already exists, updating user role");

        // Update role FIRST if profile exists
        user.role = "seller";
        await user.save();

        // Get FRESH user data after save
        const updatedUser = await User.findById(userId).select("-password");

        logger.info(`✅ User role updated to: ${updatedUser.role}`);

        // ✅ SEND EMAIL NOTIFICATION
        try {
          const EmailService = require("../email.service");

          const formattedSellerProfile = {
            shopName: existingSellerProfile.storeName,
            businessType: "Retail",
            status: existingSellerProfile.status || "active",
          };

          logger.info(`📧 Attempting to send upgrade email to: ${updatedUser.email}`);
          logger.info(`📧 User role for email: ${updatedUser.role}`);

          const emailResult = await EmailService.sendSellerUpgradeNotification(updatedUser, formattedSellerProfile);

          if (emailResult.success) {
            logger.info(`✅ Seller upgrade notification email sent successfully:`, {
              method: emailResult.method,
              messageId: emailResult.messageId,
              to: updatedUser.email,
            });
          } else {
            logger.warn(`⚠️ Failed to send seller upgrade notification:`, {
              error: emailResult.error,
              to: updatedUser.email,
            });
          }
        } catch (emailError) {
          logger.error("⚠️ Email notification error:", {
            message: emailError.message,
            stack: emailError.stack,
          });
          // Don't throw error - upgrade was successful even if email fails
        }

        return {
          success: true,
          message: "Successfully upgraded to seller",
          data: {
            user: {
              id: updatedUser._id.toString(),
              username: updatedUser.username,
              email: updatedUser.email,
              role: updatedUser.role,
              upgradedAt: new Date().toISOString(),
            },
            seller: {
              id: existingSellerProfile._id.toString(),
              shopName: existingSellerProfile.storeName,
              businessType: "Retail",
              isActive: existingSellerProfile.status === "active",
              status: existingSellerProfile.status || "active",
            },
            access: {
              sellerDashboard: true,
              canAddProducts: true,
              canManageOrders: true,
            },
          },
        };
      }

      // ✅ FIX 3: Update user role FIRST before creating profile
      user.role = "seller";
      await user.save();
      logger.info(`✅ User role updated to seller for user: ${user.username}`);

      // ✅ FIX 4: Verify role was actually saved
      const verifyUser = await User.findById(userId);
      logger.info(`🔍 Verified user role after save: ${verifyUser.role}`);

      // Prepare data for seller profile creation
      const profileData = {
        userId: userId,
        storeName: sellerData.shopName || `${user.username}'s Shop`,
        description: sellerData.shopDescription || "Welcome to my shop!",
        address: {
          street: sellerData.businessAddress || "",
          city: "",
          province: "",
          postalCode: "",
          country: "Indonesia",
        },
        contact: {
          phone: sellerData.businessPhone || "",
          email: user.email,
          socialLinks: [],
        },
      };

      logger.info("Creating seller profile with data:", profileData);

      // Create seller profile
      const sellerProfile = await SellerProfileService.createProfile(profileData);

      logger.info(`✅ Seller profile created successfully for user: ${user.username}`);

      // ✅ FIX: Get FRESH user data BEFORE sending email
      const updatedUser = await User.findById(userId).select("-password");

      logger.info(`✅ Final user role confirmed as: ${updatedUser.role}`);

      // ✅ PINDAHKAN EMAIL KE SINI - SETELAH semua DB operations
      // Send notification email
      try {
        const EmailService = require("../email.service");

        const formattedSellerProfile = {
          shopName: sellerProfile.storeName || profileData.storeName,
          businessType: sellerData.businessType || "Retail",
          status: sellerProfile.status || "active",
        };

        // ✅ FIX: Use updatedUser (yang sudah role='seller')
        const emailResult = await EmailService.sendSellerUpgradeNotification(updatedUser, formattedSellerProfile);

        if (emailResult.success) {
          logger.info(`✅ Seller upgrade notification email sent successfully:`, {
            method: emailResult.method,
            messageId: emailResult.messageId,
            to: updatedUser.email,
            role: updatedUser.role, // ✅ Add role to log
          });
        } else {
          logger.warn(`⚠️ Failed to send seller upgrade notification:`, emailResult.error);
        }
      } catch (emailError) {
        logger.error("⚠️ Email notification error:", emailError);
        // Don't throw error - upgrade was successful even if email fails
      }

      // ✅ FIX 6: Return response with FRESH user data
      return {
        success: true,
        message: "Successfully upgraded to seller",
        data: {
          user: {
            id: updatedUser._id.toString(),
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role, // ✅ Now will be 'seller'
            upgradedAt: new Date().toISOString(),
          },
          seller: {
            id: sellerProfile.id,
            shopName: sellerProfile.storeName,
            businessType: sellerData.businessType || "Retail",
            isActive: sellerProfile.status === "active",
            status: sellerProfile.status,
          },
          access: {
            sellerDashboard: true,
            canAddProducts: true,
            canManageOrders: true,
          },
        },
      };
    } catch (error) {
      logger.error("❌ Error in upgradeToSeller:", {
        errorMessage: error.message,
        errorStack: error.stack,
        userId: userId,
      });

      // Re-throw known errors
      if (
        error.message.includes("already exists") ||
        error.message.includes("already a seller") ||
        error.message.includes("Admin cannot") ||
        error.message.includes("Validation failed")
      ) {
        throw error;
      }

      throw new Error(`Failed to upgrade to seller: ${error.message}`);
    }
  }
}

module.exports = UserProfileService;
