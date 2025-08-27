// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// ====================================
// Middleware: Rate Limiting
// ====================================
let rateLimitMiddleware;
try {
  rateLimitMiddleware = require('../middlewares/rate-limit.middleware');
} catch (error) {
  console.log('⚠️ rateLimitMiddleware not found, using fallback');
  rateLimitMiddleware = { authLimit: (req, res, next) => next() }; // No-op
}

// ====================================
// Public Auth Routes
// ====================================

// Login & Registration
router.post('/login', rateLimitMiddleware.authLimit, authController.login); // POST /api/auth/login
router.post('/register', rateLimitMiddleware.authLimit, authController.register); // POST /api/auth/register

// Token refresh
router.post('/refresh', rateLimitMiddleware.authLimit, authController.refresh);  // POST /api/auth/refresh

// Password reset (OTP)
router.post('/forgot-password', rateLimitMiddleware.authLimit, authController.forgotPassword); // POST /api/auth/forgot-password
router.put('/reset-password', rateLimitMiddleware.authLimit, authController.resetPassword); // PUT /api/auth/reeset-password

// Logout
router.post('/logout', authController.logout);  // POST /api/auth/logout

// ====================================
// Protected Routes
// ====================================

// Verify token  // POST /api/auth/verify
router.get('/verify', authMiddleware.protect, (req, res) => {
  res.json({
    success: true,
    message: 'Access token is valid',
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

// Development-only debug route
// router.get('/debug/tokens', authController.debugTokens);

module.exports = router;
