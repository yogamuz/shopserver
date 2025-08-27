// ========================================
// FILE: src/services/userService.js
// ========================================
const User = require("../models/user.model");
const Profile = require("../models/profile.model");
const bcrypt = require("bcryptjs");
const { MESSAGES } = require('../constants/httpStatus');

class UserService {
  // ========================================
  // EXISTING METHODS (unchanged)
  // ========================================
  
  static async findByEmail(email) {
    return await User.findOne({ email });
  }

  static async findActiveUserByEmail(email) {
    return await User.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    });
  }

  static async findById(userId) {
    return await User.findById(userId);
  }

  static async findByIdWithRoleInfo(userId) {
    return await User.findById(userId).select('role username');
  }

  static async validateCredentials(user, password) {
    if (!user) {
      return { isValid: false, message: MESSAGES.AUTH.USER_NOT_FOUND };
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { isValid: false, message: MESSAGES.AUTH.INVALID_PASSWORD };
    }

    if (!user.isActive) {
      return { isValid: false, message: MESSAGES.AUTH.ACCOUNT_DEACTIVATED };
    }

    return { isValid: true };
  }

  static async createUser(userData) {
    const { username, email, password, role } = userData;
    
    const user = new User({
      username,
      email,
      password: await bcrypt.hash(password, 12),
      role,
    });
    
    return await user.save();
  }

  static async updatePassword(user, newPassword) {
    user.password = await bcrypt.hash(newPassword, 12);
    return await user.save();
  }

  static buildUserResponse(user, sellerProfile = null) {
    const responseData = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    if (user.role === 'seller' && sellerProfile) {
      responseData.sellerProfile = {
        id: sellerProfile._id,
        storeName: sellerProfile.storeName,
        storeSlug: sellerProfile.storeSlug,
        status: sellerProfile.status
      };
    }

    return responseData;
  }

  // ========================================
  // NEW METHODS FOR ADMIN FUNCTIONS
  // ========================================

  /**
   * Get all users with pagination and filtering
   */
  static async getAllUsers(queryParams = {}) {
    try {
      let { page = 1, limit = 10, role, isActive, search } = queryParams;

      page = Math.max(1, parseInt(page));
      limit = Math.min(50, Math.max(1, parseInt(limit))); // Max 50 users per page

      const query = {};

      if (role) query.role = role;
      if (isActive !== undefined) query.isActive = isActive === "true";
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const [users, total] = await Promise.all([
        User.find(query)
          .select("-password") // NEVER return passwords
          .sort("-createdAt")
          .limit(limit)
          .skip((page - 1) * limit),
        User.countDocuments(query),
      ]);

      return {
        users,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        }
      };
    } catch (error) {
      logger.error('❌ Error in getAllUsers service:', error);
      throw new Error(MESSAGES.USER.GET_ALL_FAILED);
    }
  }

  /**
   * Update user by ID (Admin function)
   */
  static async updateUserById(userId, updates) {
    try {
      // Admin can update more fields
      const allowedFields = ["username", "email", "role", "isActive"];
      const filteredUpdates = {};

      Object.keys(updates).forEach((key) => {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      // If updating password, hash it first
      if (updates.password) {
        filteredUpdates.password = await bcrypt.hash(updates.password, 12);
      }

      const user = await User.findByIdAndUpdate(userId, filteredUpdates, {
        new: true,
        runValidators: true,
      }).select("-password");

      if (!user) {
        throw new Error(MESSAGES.USER.NOT_FOUND);
      }

      return user;
    } catch (error) {
      logger.error('❌ Error in updateUserById service:', error);
      
      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }
      
      throw new Error(MESSAGES.USER.UPDATE_FAILED);
    }
  }

  /**
   * Soft delete user (set isActive to false)
   */
  static async softDeleteUser(userId, deletedBy) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          isActive: false,
          deletedAt: new Date(),
          deletedBy: deletedBy,
        },
        { new: true }
      );

      if (!user) {
        throw new Error(MESSAGES.USER.NOT_FOUND);
      }

      return user;
    } catch (error) {
      logger.error('❌ Error in softDeleteUser service:', error);
      
      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }
      
      throw new Error(MESSAGES.USER.SOFT_DELETE_FAILED);
    }
  }

  /**
   * Hard delete user (permanently remove from database)
   */
  static async hardDeleteUser(userId) {
    try {
      // Delete user from User collection
      const user = await User.findByIdAndDelete(userId);

      if (!user) {
        throw new Error(MESSAGES.USER.NOT_FOUND);
      }

      // Delete associated profile from Profile collection
      await Profile.deleteOne({ user: userId });

      return user;
    } catch (error) {
      logger.error('❌ Error in hardDeleteUser service:', error);
      
      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }
      
      throw new Error(MESSAGES.USER.HARD_DELETE_FAILED);
    }
  }

  /**
   * Change user role
   */
  static async changeUserRole(userId, role) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { role },
        { new: true }
      ).select("-password");

      if (!user) {
        throw new Error(MESSAGES.USER.NOT_FOUND);
      }

      return user;
    } catch (error) {
      logger.error('❌ Error in changeUserRole service:', error);
      
      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }
      
      throw new Error(MESSAGES.USER.ROLE_CHANGE_FAILED);
    }
  }

  /**
   * Change user status (active/inactive)
   */
  static async changeUserStatus(userId, isActive) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { isActive },
        { new: true }
      ).select("-password");

      if (!user) {
        throw new Error(MESSAGES.USER.NOT_FOUND);
      }

      return user;
    } catch (error) {
      logger.error('❌ Error in changeUserStatus service:', error);
      
      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }
      
      throw new Error(MESSAGES.USER.STATUS_CHANGE_FAILED);
    }
  }
}

module.exports = UserService;