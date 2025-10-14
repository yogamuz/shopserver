// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const AuthController = require("../../controllers/auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss");
const { body, validationResult } = require("express-validator");

// ====================================
// Security Middleware
// ====================================

// MongoDB injection protection
router.use(mongoSanitize());

// XSS protection middleware
const xssProtection = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === "string") {
        req.body[key] = xss(req.body[key]);
      }
    });
  }
  next();
};

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// ====================================
// Middleware: Rate Limiting
// ====================================
let rateLimitMiddleware;
try {
  rateLimitMiddleware = require("../../middlewares/rate-limit.middleware");
} catch (error) {
  console.log("⚠️ rateLimitMiddleware not found, using fallback");
  rateLimitMiddleware = { authLimit: (req, res, next) => next() };
}

// ====================================
// Validation Rules
// ====================================
const loginValidation = [
  body("email")
    .notEmpty()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Username or email is required (3-50 characters)")
    .custom(value => {
      // Jika mengandung @, validate sebagai email
      if (value.includes("@")) {
        const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(value)) {
          throw new Error("Invalid email format");
        }
      } else {
        // Jika tidak mengandung @, validate sebagai username
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          throw new Error("Username must be alphanumeric and underscore only");
        }
      }
      return true;
    }),
  body("password").isLength({ min: 6, max: 128 }).withMessage("Password must be 6-128 characters"),
];

const registerValidation = [
  body("username")
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username must be 3-30 characters, alphanumeric and underscore only"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain at least one lowercase, uppercase, and number"),
  body("role").optional().isIn(["user", "seller"]).withMessage("Role must be user or seller"),
];

const forgotPasswordValidation = [
  body("email")
    .notEmpty()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Username or email is required (3-50 characters)")
    .custom(value => {
      // Jika mengandung @, validate sebagai email
      if (value.includes("@")) {
        const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(value)) {
          throw new Error("Invalid email format");
        }
      } else {
        // Jika tidak mengandung @, validate sebagai username
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          throw new Error("Username must be alphanumeric and underscore only");
        }
      }
      return true;
    }),
];

const resetPasswordValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"), // Tetap email untuk reset
  body("otp").isLength({ min: 6, max: 6 }).isNumeric().withMessage("OTP must be 6 digits"),
  body("newPassword")
    .isLength({ min: 6, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain at least one lowercase, uppercase, and number"),
];

// ====================================
// Public Auth Routes (NO CSRF REQUIRED)
// ====================================
// Check username availability
router.get("/check-username/:username", rateLimitMiddleware.authLimit, AuthController.checkUsernameAvailability);
// Login
router.post(
  "/login",
  rateLimitMiddleware.authLimit,
  xssProtection,
  loginValidation,
  handleValidationErrors,
  AuthController.login
);

// Register
router.post(
  "/register",
  rateLimitMiddleware.authLimit,
  xssProtection,
  registerValidation,
  handleValidationErrors,
  AuthController.register
);

// Logout
router.delete("/logout", AuthController.logout);

// Forgot Password
router.post(
  "/password-reset-tokens",
  rateLimitMiddleware.authLimit,
  xssProtection,
  forgotPasswordValidation,
  handleValidationErrors,
  AuthController.forgotPassword
);

// Reset Password
router.put(
  "/passwords",
  rateLimitMiddleware.authLimit,
  xssProtection,
  resetPasswordValidation,
  handleValidationErrors,
  AuthController.resetPassword
);

// Refresh Token
router.put("/refresh", rateLimitMiddleware.authLimit, AuthController.refresh);

// ====================================
// Protected Routes
// ====================================

// Verify token
router.get("/verify", authMiddleware.protect, (req, res) => {
  res.json({
    success: true,
    message: "Access token is valid",
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
    },
    timestamp: new Date().toISOString(),
  });
});
router.put(
  "/change-password",
  authMiddleware.protect, // ✅ Butuh login
  rateLimitMiddleware.authLimit,
  xssProtection,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("New password must contain at least one lowercase, uppercase, and number"),
    body("confirmPassword")
      .notEmpty()
      .withMessage("Confirm password is required")
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error("Passwords do not match");
        }
        return true;
      }),
  ],
  handleValidationErrors,
  AuthController.changePassword
);
module.exports = router;
