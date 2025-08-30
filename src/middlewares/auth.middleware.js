// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');



exports.protect = async (req, res, next) => {
  try {
    logger.info(`🔐 Auth middleware - ${req.method} ${req.originalUrl}`);
    logger.info(`📋 Headers:`, req.headers.authorization ? 'Authorization header present' : 'No Authorization header');
    logger.info(`🍪 Cookies:`, req.cookies?.authToken ? 'authToken cookie present' : 'No authToken cookie');
    
    // 1. Get token from header or cookie
    let token;
    
    // Priority 1: Check Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      logger.info(`🎫 Token extracted from header: ${token.substring(0, 20)}...`);
    }
    // Priority 2: Check cookie if no header token
    else if (req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
      logger.info(`🎫 Token extracted from cookie: ${token.substring(0, 20)}...`);
    }

    if (!token) {
      logger.info(`❌ No token provided`);
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        hint: 'Please include Authorization header with format: Bearer <token> or ensure you are logged in. Use /refresh to get new access token.',
        needsRefresh: true
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
      
      // Handle different JWT errors
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid access token',
          hint: 'Please login again or use /refresh to get new access token',
          needsRefresh: true
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        logger.info(`⏰ Access token expired, suggesting refresh`);
        return res.status(401).json({
          success: false,
          message: 'Access token has expired',
          hint: 'Use /refresh endpoint to get new access token',
          needsRefresh: true
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Authentication failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Invalid credentials',
        needsRefresh: true
      });
    }

    // 3. Check if user still exists
    logger.info(`👤 Checking if user exists...`);
    const user = await User.findById(decoded.userId);
    if (!user) {
      logger.info(`❌ User not found: ${decoded.userId}`);
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
        hint: 'Please login again'
      });
    }

    if (!user.isActive) {
      logger.info(`❌ User is deactivated: ${user.username}`);
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated',
        hint: 'Please contact administrator'
      });
    }

    logger.info(`✅ Authentication successful for user: ${user.username} (${user.role})`);

    // 4. Grant access
    req.user = user;
    next();
  } catch (error) {
    logger.info(`💥 Auth middleware error:`, error.message);
    
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Invalid credentials',
      needsRefresh: true
    });
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    logger.info(`🛡️  Role check: User ${req.user.username} (${req.user.role}) accessing ${req.originalUrl}`);
    logger.info(`📋 Required roles: [${roles.join(', ')}]`);
    
    if (!roles.includes(req.user.role)) {
      logger.info(`❌ Access denied: User role '${req.user.role}' not in [${roles.join(', ')}]`);
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
        hint: 'Contact administrator for role upgrade'
      });
    }
    
    logger.info(`✅ Role check passed`);
    next();
  };
};

exports.validateCsrf = (req, res, next) => {
  try {
    logger.info("🛡️ CSRF validation middleware");
    
    // Skip untuk GET requests
    if (req.method === 'GET') {
      return next();
    }

    const csrfTokenFromHeader = req.headers['x-csrf-token'] || req.headers['csrf-token'];
    const csrfTokenFromCookie = req.cookies['csrf-token'];

    if (!csrfTokenFromHeader) {
      logger.info("❌ No CSRF token in header");
      return res.status(403).json({
        success: false,
        message: 'CSRF token required',
        hint: 'Include CSRF token in x-csrf-token header'
      });
    }

    if (!csrfTokenFromCookie) {
      logger.info("❌ No CSRF token in cookie");
      return res.status(403).json({
        success: false,
        message: 'CSRF session invalid',
        hint: 'Get new CSRF token from /api/auth/csrf-token'
      });
    }

    if (csrfTokenFromHeader !== csrfTokenFromCookie) {
      logger.info("❌ CSRF token mismatch");
      return res.status(403).json({
        success: false,
        message: 'CSRF token validation failed',
        hint: 'Get new CSRF token from /api/auth/csrf-token'
      });
    }

    logger.info("✅ CSRF token validated");
    next();
  } catch (error) {
    logger.error("⚡ CSRF validation error:", error);
    res.status(500).json({
      success: false,
      message: 'CSRF validation error',
      error: error.message
    });
  }
};

// NEW: Optional middleware untuk auto-refresh jika token expired
exports.autoRefresh = (req, res, next) => {
  // Middleware ini bisa digunakan untuk route yang ingin auto-refresh
  // Tapi untuk implementasi sederhana, kita biarkan client handle refresh
  next();
};