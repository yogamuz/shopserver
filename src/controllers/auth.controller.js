// ========================================
// FILE: src/controllers/authController.js
// ========================================
const { HTTP_STATUS, MESSAGES } = require("../constants/httpStatus");
const {
  sendPasswordResetOTP,
  sendPasswordChangedNotification,
} = require("../services/email.service");
const { storeOTP, validateOTP, removeOTP } = require("../utils/otpStore");
const crypto = require("crypto");

// Import services
const AuthService = require("../services/auth.service");
const AuditService = require("../services/audit.service");
const UserService = require("../services/user.service");
const SellerService = require("../services/seller.service");
const CookieHelper = require("../utils/cookie-helper");

// Import logger
const logger = require("../utils/logger");

class AuthController {


  static async login(req, res) {
    try {
      const { email, password } = req.body;

      logger.info(`🔍 Login attempt for: ${email}`);
      const user = await UserService.findByEmail(email);

      // 1. Validate user credentials
      const credentialValidation = await UserService.validateCredentials(
        user,
        password
      );
      if (!credentialValidation.isValid) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: credentialValidation.message,
        });
      }

      // 2. Additional validation for seller role
      let sellerProfile = null;
      if (user.role === "seller") {
        sellerProfile = await SellerService.getSellerProfile(user._id);
        const sellerValidation = SellerService.validateSellerForLogin(
          sellerProfile,
          user.username
        );

        if (!sellerValidation.allowLogin) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: sellerValidation.message,
          });
        }
      }

      // 3. Token management
      AuthService.removeUserRefreshTokens(user._id.toString());
      const { accessToken, refreshToken } = AuthService.generateTokens(
        user._id,
        user.role
      );
      AuthService.addRefreshToken(user._id.toString(), refreshToken);

      // 4. Set cookies
      CookieHelper.setCookies(res, accessToken, refreshToken, user.role);

      logger.info(
        `✅ Login successful for user: ${user.username} as ${user.role}`
      );

      // 5. Audit logging
      await AuditService.logUserActivity(
        user._id,
        "LOGIN",
        AuditService.getClientIP(req),
        req.headers["user-agent"],
        {
          username: user.username,
          email: user.email,
          role: user.role,
          loginType: user.role === "seller" ? "seller_login" : "user_login",
        }
      );

      // 6. Build and send response
      const responseData = UserService.buildUserResponse(user, sellerProfile);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        accessToken,
        user: responseData,
      });
    } catch (error) {
      logger.error("⚡ Login error:", error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.LOGIN_FAILED,
        error: error.message,
      });
    }
  }

  static async register(req, res) {
    try {
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
      const { accessToken, refreshToken } = AuthService.generateTokens(
        user._id,
        user.role
      );
      AuthService.addRefreshToken(user._id.toString(), refreshToken);

      // 5. Set cookies
      CookieHelper.setRegistrationCookies(res, accessToken, refreshToken);

      logger.info(
        `✅ Registration successful for user: ${user.username} as ${user.role}`
      );

      // 6. Audit logging
      await AuditService.logUserActivity(
        user._id,
        "REGISTER",
        AuditService.getClientIP(req),
        req.headers["user-agent"],
        {
          username: user.username,
          email: user.email,
          role: user.role,
          registrationType:
            user.role === "seller"
              ? "seller_registration"
              : "user_registration",
        }
      );

      // 7. Build and send response
      const responseData = UserService.buildUserResponse(user);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        accessToken,
        user: responseData,
        message:
          user.role === "seller"
            ? MESSAGES.AUTH.SELLER_REGISTRATION_SUCCESS
            : MESSAGES.AUTH.USER_REGISTRATION_SUCCESS,
      });
    } catch (error) {
      logger.error("⚡ Registration error:", error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.REGISTRATION_FAILED,
        error: error.message,
      });
    }
  }

  static async refresh(req, res) {
    try {
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

      // 6. Generate new access token
      const newAccessToken = AuthService.generateAccessToken(
        user._id,
        user.role,
        user.role === "admin" ? "2h" : "1h"
      );

      // 7. Set new access token cookie
      CookieHelper.setAccessTokenCookie(res, newAccessToken, user.role);

      logger.info(
        `✅ Access token refreshed for ${user.role}: ${user.username}`
      );

      // 8. Build and send response
      const responseData = UserService.buildUserResponse(user, sellerProfile);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        accessToken: newAccessToken,
        user: responseData,
      });
    } catch (error) {
      logger.error("⚡ Refresh error:", error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.TOKEN_REFRESH_FAILED,
        error: error.message,
      });
    }
  }

  static async logout(req, res) {
    try {
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
          logger.info(
            `🗑️ Refresh token removed for ${userRole || "user"}: ${
              decoded.userId
            }`
          );
        } catch (error) {
          logger.info(
            "⚠️ Could not decode refresh token during logout:",
            error.message
          );
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
    } catch (error) {
      logger.error("⚡ Logout error:", error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.LOGOUT_FAILED,
        error: error.message,
      });
    }
  }

  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      logger.info(`🔐 Forgot password request for: ${email}`);

      // 1. Validate input
      if (!email) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: MESSAGES.AUTH.EMAIL_REQUIRED,
        });
      }

      // 2. Check if user exists and is active
      const user = await UserService.findActiveUserByEmail(email);
      if (!user) {
        // For security, don't reveal if email exists or not
        return res.status(HTTP_STATUS.OK).json({
          success: true,
          message: MESSAGES.AUTH.PASSWORD_RESET_EMAIL_SENT,
        });
      }

      // 3. Generate and store OTP
      const otpCode = storeOTP(email, 5); // 5 minutes expiry

      // 4. Send email
      try {
        const emailResult = await sendPasswordResetOTP(user, otpCode);

        logger.info(`📧 Email result:`, emailResult);

        if (!emailResult.success) {
          logger.error("⚡ Email sending failed:", emailResult.error);
          removeOTP(email);

          return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGES.AUTH.EMAIL_SEND_FAILED,
            error:
              process.env.NODE_ENV === "development"
                ? emailResult.error
                : undefined,
          });
        }

        logger.info(`📧 Password reset OTP email sent successfully:`, {
          method: emailResult.method,
          messageId: emailResult.messageId,
          to: email,
        });

        res.status(HTTP_STATUS.OK).json({
          success: true,
          message: MESSAGES.AUTH.OTP_SENT,
          data: {
            email: email,
            expiresIn: "5 minutes",
            method: emailResult.method,
            timestamp: emailResult.timestamp,
          },
        });
      } catch (error) {
        logger.error("⚡ Unexpected error:", error);
        removeOTP(email);

        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: MESSAGES.AUTH.FORGOT_PASSWORD_FAILED,
          error: error.message,
        });
      }
    } catch (error) {
      logger.error("⚡ Forgot password error:", error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.FORGOT_PASSWORD_FAILED,
        error: error.message,
      });
    }
  }

  static async resetPassword(req, res) {
    try {
      const { email, otp, newPassword } = req.body;

      logger.info(`🔄 Reset password attempt for: ${email}`);

      // 1. Validate input
      if (!email || !otp || !newPassword) {
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

      // 3. Verify OTP
      const otpValidation = validateOTP(email, otp);
      if (!otpValidation.valid) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: MESSAGES.AUTH.INVALID_OTP,
          attemptsLeft: otpValidation.attemptsLeft,
        });
      }

      // 4. Check if user exists and is active
      const user = await UserService.findActiveUserByEmail(email);
      if (!user) {
        removeOTP(email);
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: MESSAGES.AUTH.USER_NOT_FOUND_OR_INACTIVE,
        });
      }

      // 5. Update password
      await UserService.updatePassword(user, newPassword);

      // 6. Revoke all refresh tokens for security
      AuthService.removeUserRefreshTokens(user._id.toString());

      // 7. Send notification email
      try {
        const notificationResult = await sendPasswordChangedNotification(user);

        if (notificationResult.success) {
          logger.info(
            `✅ Password changed notification sent to: ${user.email}`
          );
        } else {
          logger.warn(
            `⚠️ Failed to send password changed notification: ${notificationResult.error}`
          );
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
    } catch (error) {
      logger.error("⚡ Reset password error:", error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: MESSAGES.AUTH.PASSWORD_RESET_FAILED,
        error: error.message,
      });
    }
  }
}

// Export methods
exports.login = AuthController.login;
exports.register = AuthController.register;
exports.refresh = AuthController.refresh;
exports.logout = AuthController.logout;
exports.forgotPassword = AuthController.forgotPassword;
exports.resetPassword = AuthController.resetPassword;
exports.getCsrfToken = AuthController.getCsrfToken;
