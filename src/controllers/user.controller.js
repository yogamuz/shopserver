// controllers/userController.js
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const userService = require("../services/user.service");
const userProfileService = require("../services/user-profile.service");
const { filterUserData } = require("../utils/filter-user-data.util");
const logger = require("../utils/logger");

// POST /api/users/me - create own profile
exports.createMyProfile = async (req, res, next) => {
  try {
    logger.info('🆕 Creating profile for user:', req.user._id);
    logger.info('📋 Profile data:', req.body);
    
    const { firstName, lastName, phone, address, avatar } = req.body;
    const userId = req.user._id;

    const result = await userProfileService.createProfile(userId, {
      firstName,
      lastName,
      phone,
      address,
      avatar
    });
    
    logger.info('✅ Profile created successfully:', result.data._id);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    logger.error('❌ Error in createMyProfile:', error);
    next(error);
  }
};

// POST /api/users/me/avatar - upload avatar
exports.uploadMyAvatar = async (req, res, next) => {
  try {
    logger.info('🖼️ Uploading avatar for user:', req.user._id);
    
    if (!req.file) {
      const error = new Error(MESSAGES.PROFILE.AVATAR_FILE_REQUIRED);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    const result = await userProfileService.uploadAvatar(req.user._id, req.file);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data
    });
    
  } catch (error) {
    logger.error('❌ Error in uploadMyAvatar:', error);
    next(error);
  }
};

// DELETE /api/users/me/avatar - remove avatar
exports.removeMyAvatar = async (req, res, next) => {
  try {
    logger.info('🗑️ Removing avatar for user:', req.user._id);
    
    const result = await userProfileService.removeAvatar(req.user._id);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data
    });
    
  } catch (error) {
    logger.error('❌ Error in removeMyAvatar:', error);
    
    // Handle specific case where there's no avatar to remove
    if (error.message === MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: error.message
      });
    }
    
    next(error);
  }
};

// GET /api/users/me
exports.getMyProfile = async (req, res, next) => {
  try {
    logger.info(`👤 User ${req.user.username} accessing own user data`);
    logger.info(`🔍 User ID from JWT:`, req.user._id);

    const result = await userProfileService.getUserWithProfile(req.user._id);
    
    if (!result.success || !result.data.user) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        user: filterUserData(result.data.user, true),
        profile: result.data.profile,
      },
    });
  } catch (error) {
    logger.error("💥 Error in getMyProfile:", error);
    next(error);
  }
};

// PUT /api/users/me
exports.updateMyProfile = async (req, res, next) => {
  try {
    const { username, firstName, lastName, phone, address, avatar } = req.body;
    const userId = req.user._id;

    // Update User (if username provided)
    if (username) {
      await userService.updateUserById(userId, { username });
    }

    // Update Profile (if profile fields provided)
    const profileUpdates = { firstName, lastName, phone, address, avatar };
    const result = await userProfileService.updateProfile(userId, profileUpdates);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    logger.error('❌ Error in updateMyProfile:', error);
    next(error);
  }
};

// DELETE /api/users/me
exports.deleteMyAccount = async (req, res, next) => {
  try {
    logger.info(`🗑️ User ${req.user.username} deleting own account`);

    await userService.softDeleteUser(req.user._id, req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Account deactivated successfully",
    });
  } catch (error) {
    logger.error("💥 Error in deleteMyAccount:", error);
    next(error);
  }
};

// ADMIN ONLY FUNCTIONS

// GET /api/users - Get all users (ADMIN ONLY)
exports.getAllUsers = async (req, res, next) => {
  try {
    logger.info(`👑 Admin ${req.user.username} accessing all users`);

    const queryParams = req.query;
    const result = await userService.getAllUsers(queryParams);

    // Filter data for response
    const filteredUsers = result.users.map((user) => filterUserData(user, true));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: filteredUsers,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("💥 Error in getAllUsers:", error);
    next(error);
  }
};

// GET /api/users/:id - Get specific user (ADMIN ONLY)
exports.getUserById = async (req, res, next) => {
  try {
    logger.info(`👑 Admin ${req.user.username} accessing user ${req.params.id}`);

    const result = await userProfileService.getUserWithProfile(req.params.id);
    
    if (!result.success || !result.data.user) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        user: filterUserData(result.data.user, true),
        profile: result.data.profile,
      },
    });
  } catch (error) {
    logger.error("💥 Error in getUserById:", error);
    next(error);
  }
};

// PUT /api/users/:id - Update any user (ADMIN ONLY)
exports.updateUser = async (req, res, next) => {
  try {
    logger.info(`👑 Admin ${req.user.username} updating user ${req.params.id}`);

    const userId = req.params.id;
    const updates = req.body;

    const user = await userService.updateUserById(userId, updates);

    if (!user) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.USER.UPDATED,
      data: filterUserData(user, true),
    });
  } catch (error) {
    logger.error("💥 Error in updateUser:", error);
    next(error);
  }
};

// DELETE /api/users/:id - Soft delete user
exports.softDeleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    
    const existingUser = await userService.findById(userId);
    if (!existingUser) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    logger.info(`👑 Admin ${req.user.username} soft-deleting user "${existingUser.username}" (ID: ${userId})`);

    await userService.softDeleteUser(userId, req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `User "${existingUser.username}" soft-deleted successfully`,
    });
  } catch (error) {
    logger.error("💥 Error in softDeleteUser:", error);
    next(error);
  }
};

// DELETE /api/users/:id/hard - Permanently delete user
exports.hardDeleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    
    const existingUser = await userService.findById(userId);
    if (!existingUser) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    logger.info(`👑 Admin ${req.user.username} hard-deleting user "${existingUser.username}" (ID: ${userId})`);

    await userService.hardDeleteUser(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `User "${existingUser.username}" permanently deleted`,
    });
  } catch (error) {
    logger.error("💥 Error in hardDeleteUser:", error);
    next(error);
  }
};

// PUT /api/users/:id/role - Change user role (ADMIN ONLY)
exports.changeUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    if (!["user", "seller", "admin"].includes(role)) {
      const error = new Error(MESSAGES.USER.INVALID_ROLE);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    const user = await userService.changeUserRole(id, role);

    if (!user) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    logger.info(`👑 Admin "${req.user.username}" changing role of "${user.username}" (ID: ${user.id}) to "${role}"`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `User role changed to ${role}`,
      data: filterUserData(user, true),
    });
  } catch (error) {
    logger.error("💥 Error in changeUserRole:", error);
    next(error);
  }
};

// PUT /api/users/:id/status - Activate/Deactivate user (ADMIN ONLY)
exports.changeUserStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const { id } = req.params;

    const user = await userService.changeUserStatus(id, isActive);

    if (!user) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    logger.info(`👑 Admin ${req.user.username} changing user ${user.username} status to ${isActive ? "active" : "inactive"}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: filterUserData(user, true),
    });
  } catch (error) {
    logger.error("💥 Error in changeUserStatus:", error);
    next(error);
  }
};