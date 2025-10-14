// ========================================
// FILE: src/controllers/authController.js
// ========================================
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const EmailService = require("../services/email.service");
const { storeOTP, validateOTP, removeOTP } = require("../utils/otpStore");
const crypto = require("crypto");

// Import services
const AuthService = require("../services/auth.service");
const AuditService = require("../services/audit.service");
const UserService = require("../services/user/user.service");
const SellerService = require("../services/seller/seller.service");
const CookieHelper = require("../utils/cookie-helper");
const asyncHandler = require("../middlewares/asyncHandler");

// Import logger
const logger = require("../utils/logger");

class AuthController {
  static login = asyncHandler(async (req, res) => {
    const { email, password } = req.body; // Tetap gunakan 'email' untuk backward compatibility
    const identifier = email; // Sekarang bisa username atau email

    logger.info(`🔍 Login attempt for: ${identifier}`);

    // 1. Find user by username or email
    const user = await UserService.findByUsernameOrEmail(identifier);

    // 2. Validate user credentials
    const credentialValidation = await UserService.validateCredentials(user, password);
    if (!credentialValidation.isValid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: credentialValidation.message,
      });
    }

    // 3. Additional validation for seller role
    let sellerProfile = null;
    if (user.role === "seller") {
      sellerProfile = await SellerService.getSellerProfile(user._id);
      const sellerValidation = SellerService.validateSellerForLogin(sellerProfile, user.username);

      if (!sellerValidation.allowLogin) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: sellerValidation.message,
        });
      }
    }

    // 4. Token management
    AuthService.removeUserRefreshTokens(user._id.toString());
    const { accessToken, refreshToken, tokenId } = AuthService.generateTokens(user._id, user.role);
    AuthService.addRefreshToken(user._id.toString(), refreshToken, tokenId);

    // 5. Set cookies
    CookieHelper.setCookies(res, accessToken, refreshToken, user.role);

    logger.info(`✅ Login successful for user: ${user.username} as ${user.role}`);

    // 6. Audit logging
    await AuditService.logUserActivity(user._id, "LOGIN", AuditService.getClientIP(req), req.headers["user-agent"], {
      username: user.username,
      email: user.email,
      role: user.role,
      loginType: user.role === "seller" ? "seller_login" : "user_login",
      loginMethod: identifier.includes("@") ? "email" : "username", // Track login method
    });

    // 7. Build and send response
    const responseData = UserService.buildUserResponse(user, sellerProfile);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      accessToken,
      user: responseData,
    });
  });

  static register = asyncHandler(async (req, res) => {
    const { username, email, password, role } = req.body;

    logger.info(`🔍 Registration attempt for: ${email} as ${role || "user"}`);

    // 1. Validate role
    const allowedRoles = ["user", "seller"];
    const userRole = role && allowedRoles.includes(role) ? role : "user";

    // 2. Check if user exists
    const existingUser = await UserService.findByEmail(email);
    if (existingUser) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.USER_ALREADY_EXISTS,
      });
    }

    // 3. Create new user
    const user = await UserService.createUser({
      username,
      email,
      password,
      role: userRole,
    });

    // 4. Token management
    const { accessToken, refreshToken, tokenId } = AuthService.generateTokens(user._id, user.role);
    AuthService.addRefreshToken(user._id.toString(), refreshToken, tokenId);

    // 5. Set cookies
    CookieHelper.setRegistrationCookies(res, accessToken, refreshToken);

    logger.info(`✅ Registration successful for user: ${user.username} as ${user.role}`);

    // 6. Audit logging
    await AuditService.logUserActivity(user._id, "REGISTER", AuditService.getClientIP(req), req.headers["user-agent"], {
      username: user.username,
      email: user.email,
      role: user.role,
      registrationType: user.role === "seller" ? "seller_registration" : "user_registration",
    });

    // 7. Build and send response
    const responseData = UserService.buildUserResponse(user);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      accessToken,
      user: responseData,
      message:
        user.role === "seller" ? MESSAGES.AUTH.SELLER_REGISTRATION_SUCCESS : MESSAGES.AUTH.USER_REGISTRATION_SUCCESS,
    });
  });

  // Fixed refresh method in auth.controller.js
  static refresh = asyncHandler(async (req, res) => {
    logger.info("🔄 Refresh token attempt");

    // 1. Get and validate refresh token from cookie
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      logger.info("⚡ No refresh token provided");
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.REFRESH_TOKEN_NOT_PROVIDED,
      });
    }

    // 2. Verify and decode refresh token
    let decoded;
    try {
      decoded = AuthService.verifyRefreshToken(refreshToken);
      logger.info(`🔍 Refresh token decoded for user: ${decoded.userId}`);
    } catch (error) {
      logger.info("⚡ Invalid refresh token:", error.message);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      });
    }

    // 3. Check if refresh token is in valid list
    if (!AuthService.isValidRefreshToken(decoded.userId, refreshToken)) {
      logger.info("⚡ Refresh token not in valid list");
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.REFRESH_TOKEN_REVOKED,
      });
    }

    // 4. Check if user still exists and is active
    const user = await UserService.findById(decoded.userId);
    if (!user || !user.isActive) {
      logger.info("⚡ User not found or inactive");
      AuthService.removeRefreshToken(decoded.userId, refreshToken);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.USER_NOT_EXISTS_OR_INACTIVE,
      });
    }

    // 5. Additional validation for seller role
    let sellerProfile = null;
    if (user.role === "seller") {
      sellerProfile = await SellerService.getSellerProfile(user._id);
      SellerService.validateSellerForRefresh(sellerProfile);
    }

    // 6. **FIX**: Generate NEW tokens (both access and refresh)
    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenId: newTokenId,
    } = AuthService.generateTokens(user._id, user.role);

    // 7. **FIX**: Rotate refresh tokens for security
    AuthService.removeRefreshToken(decoded.userId, refreshToken); // Remove old
    AuthService.addRefreshToken(decoded.userId, newRefreshToken, newTokenId); // Add new

    // 8. **FIX**: Set both cookies with new tokens
    CookieHelper.setCookies(res, newAccessToken, newRefreshToken, user.role);

    logger.info(`✅ Both tokens refreshed for ${user.role}: ${user.username}`);

    // 9. Build and send response
    const responseData = UserService.buildUserResponse(user, sellerProfile);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken, // Include new refresh token in response
      user: responseData,
    });
  });

  static logout = asyncHandler(async (req, res) => {
    logger.info("🚪 Logout attempt");

    const refreshToken = req.cookies.refreshToken;
    let loggedOutUserId = null;
    let userRole = null;

    // Process refresh token if available
    if (refreshToken) {
      try {
        const decoded = AuthService.verifyRefreshToken(refreshToken);
        loggedOutUserId = decoded.userId;

        // Get user role for better logging
        const user = await UserService.findByIdWithRoleInfo(decoded.userId);
        userRole = user?.role;

        // Remove refresh token from valid list
        AuthService.removeRefreshToken(decoded.userId, refreshToken);
        logger.info(`🗑️ Refresh token removed for ${userRole || "user"}: ${decoded.userId}`);
      } catch (error) {
        logger.info("⚠️ Could not decode refresh token during logout:", error.message);
      }
    }

    // Clear cookies
    CookieHelper.clearCookies(res);

    logger.info(`✅ Logout successful for ${userRole || "user"}`);

    // Audit logging for logout
    if (loggedOutUserId) {
      await AuditService.logUserActivity(
        loggedOutUserId,
        "LOGOUT",
        AuditService.getClientIP(req),
        req.headers["user-agent"],
        {
          role: userRole,
          logoutType: userRole === "seller" ? "seller_logout" : "user_logout",
        }
      );
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.AUTH.LOGOUT_SUCCESS,
    });
  });

  static forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body; // Tetap gunakan 'email' untuk backward compatibility
    const identifier = email; // Sekarang bisa username atau email

    logger.info(`🔍 Forgot password request for: ${identifier}`);

    // 1. Validate input
    if (!identifier) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.EMAIL_REQUIRED,
      });
    }

    // 2. Check if user exists and is active (by username or email)
    const user = await UserService.findActiveUserByUsernameOrEmail(identifier);
    if (!user) {
      // For security, don't reveal if email/username exists or not
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: MESSAGES.AUTH.PASSWORD_RESET_EMAIL_SENT,
      });
    }

    // 3. Generate and store OTP menggunakan email user yang ditemukan
    const otpCode = storeOTP(user.email, 5); // Selalu gunakan email untuk OTP

    // 4. Send email
    try {
      const emailResult = await EmailService.sendPasswordResetOTP(user, otpCode);

      logger.info(`📧 Email result:`, emailResult);

      if (!emailResult.success) {
        logger.error("⚡ Email sending failed:", emailResult.error);
        removeOTP(user.email);

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: MESSAGES.AUTH.EMAIL_SEND_FAILED,
          error: process.env.NODE_ENV === "development" ? emailResult.error : undefined,
        });
      }

      logger.info(`📧 Password reset OTP email sent successfully:`, {
        method: emailResult.method,
        messageId: emailResult.messageId,
        to: user.email,
        requestedBy: identifier,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: MESSAGES.AUTH.OTP_SENT,
        data: {
          email: user.email, // Selalu return email yang actual
          expiresIn: "5 minutes",
          method: emailResult.method,
          timestamp: emailResult.timestamp,
        },
      });
    } catch (error) {
      logger.error("⚡ Unexpected error:", error);
      removeOTP(user.email);

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.FORGOT_PASSWORD_FAILED,
        error: error.message,
      });
    }
  });

  static resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const identifier = email; // Bisa username atau email

    logger.info(`🔄 Reset password attempt for: ${identifier}`);

    // 1. Validate input
    if (!identifier || !otp || !newPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.OTP_PASSWORD_REQUIRED,
      });
    }

    // 2. Validate password length
    if (newPassword.length < 6) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.PASSWORD_TOO_SHORT,
      });
    }

    // 3. Find user first to get actual email for OTP validation
    const user = await UserService.findActiveUserByUsernameOrEmail(identifier);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: MESSAGES.AUTH.USER_NOT_FOUND_OR_INACTIVE,
      });
    }

    // 4. Verify OTP menggunakan email yang actual
    const otpValidation = validateOTP(user.email, otp);
    if (!otpValidation.valid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.INVALID_OTP,
        attemptsLeft: otpValidation.attemptsLeft,
      });
    }

    // 5. Update password
    await UserService.updatePassword(user, newPassword);

    // 6. Revoke all refresh tokens for security
    AuthService.removeUserRefreshTokens(user._id.toString());

    // 7. Send notification email
    try {
      const notificationResult = await EmailService.sendPasswordChangedNotification(user);

      if (notificationResult.success) {
        logger.info(`✅ Password changed notification sent to: ${user.email}`);
      } else {
        logger.warn(`⚠️ Failed to send password changed notification: ${notificationResult.error}`);
      }
    } catch (emailError) {
      logger.error("⚡ Email notification error:", emailError);
    }

    logger.info(`✅ Password reset successful for user: ${user.username}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.AUTH.PASSWORD_RESET_SUCCESS,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  });

  static changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id; // Dari auth middleware

    logger.info(`🔐 Change password attempt for user: ${userId}`);

    // 1. Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Current password, new password, and confirm password are required",
      });
    }

    // 2. Validate new password length
    if (newPassword.length < 6) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.AUTH.PASSWORD_TOO_SHORT,
      });
    }

    // 3. Check if new password matches confirm password
    if (newPassword !== confirmPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    // 4. Check if new password is same as current password
    if (currentPassword === newPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // 5. Get user and validate current password
    const user = await UserService.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: MESSAGES.AUTH.USER_NOT_FOUND,
      });
    }

    // 6. Verify current password
    const credentialValidation = await UserService.validateCredentials(user, currentPassword);

    if (!credentialValidation.isValid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // 7. Update password
    await UserService.updatePassword(user, newPassword);

    // 8. Revoke all refresh tokens except current session for security
    const currentRefreshToken = req.cookies.refreshToken;
    AuthService.removeUserRefreshTokens(user._id.toString());

    // 9. Re-add current refresh token to keep user logged in
    if (currentRefreshToken) {
      try {
        const decoded = AuthService.verifyRefreshToken(currentRefreshToken);
        AuthService.addRefreshToken(user._id.toString(), currentRefreshToken, decoded.tokenId);
      } catch (error) {
        logger.warn("⚠️ Could not preserve current session:", error.message);
      }
    }

    // 10. Send notification email
    try {
      const notificationResult = await EmailService.sendPasswordChangedNotification(user);

      if (notificationResult.success) {
        logger.info(`✅ Password changed notification sent to: ${user.email}`);
      } else {
        logger.warn(`⚠️ Failed to send password changed notification: ${notificationResult.error}`);
      }
    } catch (emailError) {
      logger.error("⚡ Email notification error:", emailError);
    }

    // 11. Audit logging
    await AuditService.logUserActivity(
      user._id,
      "PASSWORD_CHANGE",
      AuditService.getClientIP(req),
      req.headers["user-agent"],
      {
        username: user.username,
        email: user.email,
        role: user.role,
        changeType: "password_change_authenticated",
      }
    );

    logger.info(`✅ Password changed successfully for user: ${user.username}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Password changed successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  });
  static checkUsernameAvailability = asyncHandler(async (req, res) => {
    const { username } = req.params;

    // Validate username format
    if (!username || username.length < 3 || username.length > 30) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        available: false,
        message: "Username must be 3-30 characters",
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        available: false,
        message: "Username must be alphanumeric and underscore only",
      });
    }

    // Check if username exists
    const existingUser = await UserService.findByUsername(username);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      available: !existingUser,
      message: existingUser ? "Username is already taken" : "Username is available",
    });
  });


static requestSellerUpgrade = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { shopName, shopDescription, businessType, businessAddress, businessPhone } = req.body;

  logger.info(`🔄 Seller upgrade request from user: ${userId}`);

  // Validate user eligibility
  const user = await UserService.findById(userId);
  const eligibility = await user.canUpgradeToSeller();

  if (!eligibility.canUpgrade) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: eligibility.reason,
    });
  }

  // Process upgrade
  const sellerProfile = await user.upgradeToSeller({
    shopName,
    shopDescription,
    businessType,
    businessAddress,
    businessPhone,
  });

  // ✅ FIX: Get FRESH user data after upgrade
  const updatedUser = await UserService.findById(userId);
  
  logger.info(`✅ User role after upgrade: ${updatedUser.role}`);

  // ✅ FIX: Send email dengan updated user
  try {
    const EmailService = require("../services/email.service");

    const formattedSellerProfile = {
      shopName: shopName || `${updatedUser.username}'s Shop`,
      businessType: businessType || "Retail",
      status: "active",
    };

    const emailResult = await EmailService.sendSellerUpgradeNotification(updatedUser, formattedSellerProfile);

    if (emailResult.success) {
      logger.info(`✅ Seller upgrade notification sent to: ${updatedUser.email}`, {
        method: emailResult.method,
        messageId: emailResult.messageId,
      });
    } else {
      logger.warn(`⚠️ Failed to send upgrade notification:`, emailResult.error);
    }
  } catch (emailError) {
    logger.error("⚠️ Email notification error:", emailError);
    // Don't fail the upgrade if email fails
  }

  // Audit logging
  await AuditService.logUserActivity(
    updatedUser._id,
    "ROLE_UPGRADE",
    AuditService.getClientIP(req),
    req.headers["user-agent"],
    {
      fromRole: "user",
      toRole: "seller",
      shopName: shopName,
    }
  );

  logger.info(`✅ User upgraded to seller: ${updatedUser.username}`);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Successfully upgraded to seller",
    data: {
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        role: updatedUser.role, // ✅ Now will be 'seller'
      },
      sellerProfile: {
        id: sellerProfile._id,
        shopName: sellerProfile.shopName,
        status: sellerProfile.status,
      },
    },
  });
});

}

// Export methods
module.exports = AuthController;
