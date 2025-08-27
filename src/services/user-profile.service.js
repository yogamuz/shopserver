// services/userProfileService.js
const Profile = require("../models/profile.model");
const User = require("../models/user.model");
const { uploadImage, deleteImage } = require("../utils/image-uploader.util");
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const logger = require("../utils/logger");
/**
 * Create user profile
 */
const createProfile = async (userId, profileData) => {
  try {
    // Check if profile already exists
    const existingProfile = await Profile.findOne({ user: userId });
    if (existingProfile) {
      throw new Error(MESSAGES.PROFILE.USE_PUT_TO_UPDATE);
    }

    // Create new profile
    const profile = await Profile.create({ 
      user: userId,
      ...profileData
    });

    // Populate and return
    const populatedProfile = await Profile.findById(profile._id)
      .populate('user', 'username email role');
    
    logger.info('✅ Profile created successfully for user:', userId);
    
    return {
      success: true,
      data: populatedProfile,
      message: MESSAGES.PROFILE.CREATED
    };
  } catch (error) {
    logger.error('❌ Error creating profile:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      throw new Error(MESSAGES.PROFILE.ALREADY_EXISTS);
    }
    
    // If it's our custom error message, throw as is
    if (error.message === MESSAGES.PROFILE.USE_PUT_TO_UPDATE) {
      throw error;
    }
    
    // For other errors, throw with generic create failed message
    throw new Error(MESSAGES.PROFILE.CREATE_FAILED);
  }
};

/**
 * Upload avatar for user profile
 */
const uploadAvatar = async (userId, file) => {
  try {
    if (!file) {
      throw new Error(MESSAGES.PROFILE.AVATAR_FILE_REQUIRED);
    }

    // Get existing profile to check for old avatar
    const existingProfile = await Profile.findOne({ user: userId });
    const oldAvatarUrl = existingProfile?.avatar;

    // Upload new avatar with specific config for avatars
    const uploadConfig = {
      folder: 'avatars',
      dimensions: { width: 300, height: 300 },
      quality: 85,
      format: 'webp'
    };

    const uploadResult = await uploadImage(file, uploadConfig);
    
    if (!uploadResult.success) {
      // Handle specific upload errors
      if (uploadResult.message.includes('Invalid file type')) {
        throw new Error(MESSAGES.PROFILE.INVALID_IMAGE_TYPE);
      }
      if (uploadResult.message.includes('too large')) {
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
        upsert: true // Create if doesn't exist
      }
    ).populate('user', 'username email role');

    // Delete old avatar if exists and upload was successful
    if (oldAvatarUrl && oldAvatarUrl !== uploadResult.imageUrl) {
      try {
        await deleteImage(oldAvatarUrl);
        logger.info(`🗑️ Old avatar deleted: ${oldAvatarUrl}`);
      } catch (deleteError) {
        logger.warn(`⚠️ Failed to delete old avatar: ${deleteError.message}`);
        // Don't throw error here, avatar update was successful
      }
    }

    logger.info(`✅ Avatar uploaded successfully for user: ${userId}`);
    
    return {
      success: true,
      message: MESSAGES.PROFILE.AVATAR_UPLOADED,
      data: {
        profile: updatedProfile,
        avatar: {
          url: uploadResult.imageUrl,
          fileName: uploadResult.fileName,
          metadata: uploadResult.metadata
        }
      }
    };

  } catch (error) {
    logger.error('❌ Error in uploadAvatar:', error);
    
    // If it's our custom error message, throw as is
    if (error.message.includes('PROFILE.')) {
      throw error;
    }
    
    // For other errors, throw with generic upload failed message
    throw new Error(MESSAGES.PROFILE.AVATAR_UPLOAD_FAILED);
  }
};

/**
 * Update avatar for user profile
 */
const updateAvatar = async (userId, file) => {
  try {
    // Use the same logic as uploadAvatar since it handles both create and update
    const result = await uploadAvatar(userId, file);
    
    // Change message to indicate update
    return {
      ...result,
      message: MESSAGES.PROFILE.AVATAR_UPDATED
    };
  } catch (error) {
    logger.error('❌ Error in updateAvatar:', error);
    
    // If it's our custom error message, throw as is
    if (error.message.includes('PROFILE.')) {
      throw error;
    }
    
    throw new Error(MESSAGES.PROFILE.AVATAR_UPDATE_FAILED);
  }
};

/**
 * Remove avatar from user profile
 */
const removeAvatar = async (userId) => {
  try {
    const profile = await Profile.findOne({ user: userId });
    
    if (!profile || !profile.avatar) {
      throw new Error(MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE);
    }

    const oldAvatarUrl = profile.avatar;

    // Remove avatar from profile
    profile.avatar = null;
    await profile.save();

    // Delete image file
    try {
      await deleteImage(oldAvatarUrl);
      logger.info(`🗑️ Avatar deleted: ${oldAvatarUrl}`);
    } catch (deleteError) {
      logger.warn(`⚠️ Failed to delete avatar file: ${deleteError.message}`);
      // Don't throw error here, profile update was successful
    }

    const updatedProfile = await Profile.findById(profile._id)
      .populate('user', 'username email role');

    logger.info(`✅ Avatar removed successfully for user: ${userId}`);

    return {
      success: true,
      message: MESSAGES.PROFILE.AVATAR_REMOVED,
      data: updatedProfile
    };

  } catch (error) {
    logger.error('❌ Error in removeAvatar:', error);
    
    // If it's our custom error message, throw as is
    if (error.message === MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE) {
      throw error;
    }
    
    throw new Error(MESSAGES.PROFILE.AVATAR_REMOVE_FAILED);
  }
};

/**
 * Get user profile with avatar info
 */
const getProfile = async (userId) => {
  try {
    const profile = await Profile.findOne({ user: userId })
      .populate('user', 'username email role');

    return {
      success: true,
      data: profile
    };
  } catch (error) {
    logger.error('❌ Error in getProfile:', error);
    throw error;
  }
};

/**
 * Get user data with profile (helper for controller)
 */
const getUserWithProfile = async (userId) => {
  try {
    // Get user data
    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      return {
        success: false,
        data: null
      };
    }

    // Get profile data if exists
    const profile = await Profile.findOne({ user: userId });

    return {
      success: true,
      data: {
        user,
        profile: profile || null
      }
    };
  } catch (error) {
    logger.error('❌ Error in getUserWithProfile:', error);
    throw error;
  }
};

/**
 * Update user profile data (excluding avatar)
 */
const updateProfile = async (userId, profileData) => {
  try {
    // Remove avatar from profileData if present (use uploadAvatar for avatar updates)
    const { avatar, ...updateData } = profileData;
    
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: userId },
      updateData,
      { 
        new: true, 
        runValidators: true,
        upsert: true
      }
    ).populate('user', 'username email role');

    logger.info(`✅ Profile updated successfully for user: ${userId}`);

    return {
      success: true,
      message: MESSAGES.PROFILE.UPDATED,
      data: updatedProfile
    };
  } catch (error) {
    logger.error('❌ Error in updateProfile:', error);
    throw new Error(MESSAGES.PROFILE.UPDATE_FAILED);
  }
};

module.exports = {
  createProfile,
  uploadAvatar,
  updateAvatar,
  removeAvatar,
  getProfile,
  getUserWithProfile,
  updateProfile
};