// ========================================
// FILE: src/services/userService.js
// ========================================
const User = require("../../models/user.model");
const Profile = require("../../models/profile.model");
const bcrypt = require("bcryptjs");
const { MESSAGES } = require("../../constants/httpStatus");
const logger = require("../../utils/logger");

class UserService {
  // ========================================
  // EXISTING METHODS (unchanged)
  // ========================================

  static async findByEmail(email) {
    return await User.findOne({ email });
  }
  static async findByUsername(username) {
    return await User.findOne({
      username: { $regex: new RegExp(`^${username}$`, "i") },
      isActive: true,
    });
  }

  static async findByUsernameOrEmail(identifier) {
    // Cek apakah identifier adalah email (mengandung @)
    const isEmail = identifier.includes("@");

    if (isEmail) {
      return await User.findOne({
        email: identifier.toLowerCase(),
        isActive: true,
      });
    } else {
      return await User.findOne({
        username: { $regex: new RegExp(`^${identifier}$`, "i") },
        isActive: true,
      });
    }
  }

  static async findActiveUserByUsernameOrEmail(identifier) {
    // Cek apakah identifier adalah email (mengandung @)
    const isEmail = identifier.includes("@");

    if (isEmail) {
      return await User.findOne({
        email: identifier.toLowerCase(),
        isActive: true,
      });
    } else {
      return await User.findOne({
        username: { $regex: new RegExp(`^${identifier}$`, "i") },
        isActive: true,
      });
    }
  }

  static async findActiveUserByEmail(email) {
    return await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    });
  }

  static async findById(userId) {
    return await User.findById(userId);
  }

  static async findByIdWithRoleInfo(userId) {
    return await User.findById(userId).select("role username");
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

    if (user.role === "seller" && sellerProfile) {
      responseData.sellerProfile = {
        id: sellerProfile._id,
        storeName: sellerProfile.storeName,
        storeSlug: sellerProfile.storeSlug,
        status: sellerProfile.status,
      };
    }

    return responseData;
  }

  // ========================================
  // NEW METHOD FOR USER PROFILE UPDATE
  // ========================================

  /**
   * Update user by ID - For regular user updates (limited fields)
   */
  static async updateUserById(userId, updates) {
    try {
      // User can only update specific fields
      const allowedFields = ["username", "email"];
      const filteredUpdates = {};

      Object.keys(updates).forEach((key) => {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      const user = await User.findByIdAndUpdate(userId, filteredUpdates, {
        new: true,
        runValidators: true,
      }).select("-password");

      if (!user) {
        throw new Error(MESSAGES.USER.NOT_FOUND);
      }

      return user;
    } catch (error) {
      logger.error("❌ Error in updateUserById service:", error);

      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }

      throw new Error(MESSAGES.USER.UPDATE_FAILED);
    }
  }
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
      logger.error("❌ Error in softDeleteUser service:", error);

      if (error.message === MESSAGES.USER.NOT_FOUND) {
        throw error;
      }

      throw new Error(MESSAGES.USER.SOFT_DELETE_FAILED);
    }
  }
}

module.exports = UserService;
