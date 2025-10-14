// admin-user.controller.js - ADMIN ONLY USER OPERATIONS (RESTful)
const AdminUserService = require("../../services/admin/admin-user.service");
const userProfileService = require("../../services/user/user-profile.service");
const { filterUserData } = require("../../utils/filter-user-data.util");
const asyncHandler = require("../../middlewares/asyncHandler");
const { HTTP_STATUS, MESSAGES } = require("../../constants/httpStatus");
const logger = require("../../utils/logger");

/**
 * Admin User Controller
 * Handles ADMIN ONLY operations for user management (RESTful)
 */
class AdminUserController {
  /**
   * GET /api/admin/users - Get all users (ADMIN ONLY)
   */
static getAllUsers = asyncHandler(async (req, res) => {
  logger.info(`👑 Admin ${req.user.username} accessing all users`);

  const queryParams = req.query;
  const result = await AdminUserService.getAllUsers(queryParams);

  // Transform users untuk frontend (tambahkan id field dan avatar dari profile)
  const filteredUsers = await Promise.all(
    result.users.map(async (user) => {
      const filtered = filterUserData(user, true);
      
      // Get avatar dari profile
      const Profile = require("../../models/profile.model");
      const profile = await Profile.findOne({ user: user._id }).select("avatar");
      
      return {
        ...filtered,
        id: user._id.toString(),
        avatar: profile?.avatar || null, // Avatar dari Profile model
      };
    })
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: filteredUsers,
    pagination: result.pagination,
  });
});

  /**
   * GET /api/admin/users/:userId - Get specific user (ADMIN ONLY)
   */
  static getUserById = asyncHandler(async (req, res) => {
    logger.info(`👑 Admin ${req.user.username} accessing user ${req.params.userId}`);

    const result = await userProfileService.getUserWithProfile(req.params.userId);
    
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
   * PUT /api/admin/users/:userId - Update any user (ADMIN ONLY)
   */
  static updateUser = asyncHandler(async (req, res) => {
    logger.info(`👑 Admin ${req.user.username} updating user ${req.params.userId}`);

    const userId = req.params.userId;
    const updates = req.body;

    const user = await AdminUserService.updateUserById(userId, updates);

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
   * DELETE /api/admin/users/:userId - Delete user (ADMIN ONLY)
   * Query parameter: ?permanent=true for hard delete, default is soft delete
   */
  static deleteUser = asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const { permanent } = req.query;
    
    const existingUser = await AdminUserService.findById(userId);
    if (!existingUser) {
      const error = new Error(MESSAGES.USER.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    let message;
    
    if (permanent === 'true') {
      logger.info(`👑 Admin ${req.user.username} hard-deleting user "${existingUser.username}" (ID: ${userId})`);
      await AdminUserService.hardDeleteUser(userId);
      message = `User "${existingUser.username}" permanently deleted`;
    } else {
      logger.info(`👑 Admin ${req.user.username} soft-deleting user "${existingUser.username}" (ID: ${userId})`);
      await AdminUserService.softDeleteUser(userId, req.user._id);
      message = `User "${existingUser.username}" soft-deleted successfully`;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message,
    });
  });

  /**
   * PATCH /api/admin/users/:userId/role - Change user role (ADMIN ONLY)
   */
  static changeUserRole = asyncHandler(async (req, res) => {
    const { role } = req.body;
    const { userId } = req.params;

    if (!["user", "seller", "admin"].includes(role)) {
      const error = new Error(MESSAGES.USER.INVALID_ROLE);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    const user = await AdminUserService.changeUserRole(userId, role);

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
   * PATCH /api/admin/users/:userId/status - Activate/Deactivate user (ADMIN ONLY)
   */
  static changeUserStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body;
    const { userId } = req.params;

    const user = await AdminUserService.changeUserStatus(userId, isActive);

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

  // Legacy methods untuk backward compatibility (bisa dihapus setelah semua client update)
  static softDeleteUser = asyncHandler(async (req, res) => {
    // Redirect to new deleteUser method without permanent flag
    req.query.permanent = 'false';
    return AdminUserController.deleteUser(req, res);
  });

  static hardDeleteUser = asyncHandler(async (req, res) => {
    // Redirect to new deleteUser method with permanent flag
    req.query.permanent = 'true';
    return AdminUserController.deleteUser(req, res);
  });
}

module.exports = AdminUserController;