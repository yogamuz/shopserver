// controllers/userController.js - REFACTORED TO CLASS-BASED VERSION
const userService = require("../services/user.service");
const userProfileService = require("../services/user-profile.service");
const { filterUserData } = require("../utils/filter-user-data.util");
const asyncHandler = require("../middlewares/asyncHandler");
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const logger = require("../utils/logger");

class UserController {
  /**
   * POST /api/users/me - Create own profile
   */
  static createMyProfile = asyncHandler(async (req, res) => {
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
  });

  /**
   * POST /api/users/me/avatar - Upload avatar
   */
  static uploadMyAvatar = asyncHandler(async (req, res) => {
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
  });

  /**
   * DELETE /api/users/me/avatar - Remove avatar
   */
  static removeMyAvatar = asyncHandler(async (req, res) => {
    logger.info('🗑️ Removing avatar for user:', req.user._id);
    
    const result = await userProfileService.removeAvatar(req.user._id);
    
    if (result.message === MESSAGES.PROFILE.NO_AVATAR_TO_REMOVE) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message
      });
    }
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result.data
    });
  });

  /**
   * GET /api/users/me - Get my profile
   */
  static getMyProfile = asyncHandler(async (req, res) => {
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
  });

  /**
   * PUT /api/users/me - Update my profile
   */
  static updateMyProfile = asyncHandler(async (req, res) => {
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
  });

  /**
   * DELETE /api/users/me - Delete my account
   */
  static deleteMyAccount = asyncHandler(async (req, res) => {
    logger.info(`🗑️ User ${req.user.username} deleting own account`);

    await userService.softDeleteUser(req.user._id, req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Account deactivated successfully",
    });
  });

  // ADMIN ONLY FUNCTIONS

  /**
   * GET /api/users - Get all users (ADMIN ONLY)
   */
  static getAllUsers = asyncHandler(async (req, res) => {
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
  });

  /**
   * GET /api/users/:id - Get specific user (ADMIN ONLY)
   */
  static getUserById = asyncHandler(async (req, res) => {
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
  });

  /**
   * PUT /api/users/:id - Update any user (ADMIN ONLY)
   */
  static updateUser = asyncHandler(async (req, res) => {
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
  });

  /**
   * DELETE /api/users/:id - Soft delete user (ADMIN ONLY)
   */
  static softDeleteUser = asyncHandler(async (req, res) => {
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
  });

  /**
   * DELETE /api/users/:id/hard - Permanently delete user (ADMIN ONLY)
   */
  static hardDeleteUser = asyncHandler(async (req, res) => {
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
  });

  /**
   * PUT /api/users/:id/role - Change user role (ADMIN ONLY)
   */
  static changeUserRole = asyncHandler(async (req, res) => {
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
  });

  /**
   * PUT /api/users/:id/status - Activate/Deactivate user (ADMIN ONLY)
   */
  static changeUserStatus = asyncHandler(async (req, res) => {
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
  });
}

module.exports = UserController;