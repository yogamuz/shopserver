// src/middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const logger = require("../utils/logger");

// src/middlewares/authMiddleware.js - FIXED VERSION

exports.protect = async (req, res, next) => {
  try {
    logger.info(`🔐 Auth middleware - ${req.method} ${req.originalUrl}`);
    
    let token;

    // ✅ FIX: Check Authorization header first, then fallback to cookie
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
      logger.info(`🎫 Token from Authorization header: ${token.substring(0, 20)}...`);
    } 
    // ✅ NEW: Fallback to refreshToken cookie if no header
    else if (req.cookies.refreshToken) {
      logger.info(`🍪 No Authorization header, but refreshToken cookie exists`);
      // Return error dengan hint untuk refresh
      return res.status(401).json({
        success: false,
        message: "Access token required in Authorization header",
        hint: "Use /refresh endpoint to get new access token",
        needsRefresh: true,
      });
    }

    if (!token) {
      logger.info(`❌ No token provided`);
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
        hint: "Please login or use /refresh to get new access token",
        needsRefresh: true,
      });
    }

    // 2. Verify token
    logger.info(`🔍 Verifying access token...`);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info(`✅ Token verified for user ID: ${decoded.userId}`);
    } catch (error) {
      logger.info(`💥 Token verification failed:`, error.message);

      if (error.name === "TokenExpiredError") {
        logger.info(`⏰ Access token expired, suggesting refresh`);
        return res.status(401).json({
          success: false,
          message: "Access token has expired",
          hint: "Use /refresh endpoint to get new access token",
          needsRefresh: true,
          expiredAt: error.expiredAt,
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid access token",
        hint: "Please login again or use /refresh",
        needsRefresh: true,
      });
    }

    // 3. Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: user ? "Account has been deactivated" : "User no longer exists",
      });
    }

    // 4. Update last seen
    try {
      await User.findByIdAndUpdate(user._id, { lastSeen: new Date() }, { timestamps: false });
    } catch (error) {
      logger.warn(`⚠️  Failed to update lastSeen: ${error.message}`);
    }

    logger.info(`✅ Auth successful: ${user.username} (${user.role})`);

    req.user = user;
    next();
  } catch (error) {
    logger.info(`💥 Auth middleware error:`, error.message);
    res.status(401).json({
      success: false,
      message: "Authentication failed",
      needsRefresh: true,
    });
  }
};

// restrictTo method tetap sama, tidak berubah
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    logger.info(`🛡️  Role check: ${req.user.username} (${req.user.role})`);
    
    if (!roles.includes(req.user.role)) {
      logger.info(`❌ Access denied: role '${req.user.role}' not in [${roles.join(", ")}]`);
      return res.status(403).json({
        success: false,
        message: `Access denied. Required: ${roles.join(" or ")}`,
      });
    }

    logger.info(`✅ Role check passed`);
    next();
  };
};

// NEW: Optional middleware untuk auto-refresh jika token expired
exports.autoRefresh = (req, res, next) => {
  // Middleware ini bisa digunakan untuk route yang ingin auto-refresh
  // Tapi untuk implementasi sederhana, kita biarkan client handle refresh
  next();
};
