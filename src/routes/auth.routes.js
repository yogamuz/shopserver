// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { validateCsrf } = require('../middlewares/auth.middleware');

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
// Public Auth Routes (NO CSRF REQUIRED)
// ====================================

// CSRF token endpoint - HARUS PUBLIC (tidak butuh CSRF)
router.get('/csrf-token', authController.getCsrfToken); 

// Token refresh - biasanya tidak butuh CSRF karena pakai httpOnly cookie
router.post('/refresh', rateLimitMiddleware.authLimit, authController.refresh);

// ====================================
// Auth Routes WITH CSRF Protection
// ====================================

// Login & Registration - BUTUH CSRF token
router.post('/login', rateLimitMiddleware.authLimit, validateCsrf, authController.login);
router.post('/register', rateLimitMiddleware.authLimit, validateCsrf, authController.register);

// Password reset - BUTUH CSRF token untuk security
router.post('/forgot-password', rateLimitMiddleware.authLimit, validateCsrf, authController.forgotPassword);
router.put('/reset-password', rateLimitMiddleware.authLimit, validateCsrf, authController.resetPassword);

// Logout - BUTUH CSRF token 
router.post('/logout', validateCsrf, authController.logout);

// ====================================
// Protected Routes
// ====================================

// Verify token  
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