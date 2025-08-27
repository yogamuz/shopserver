// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const rateLimitMiddleware = require('../middlewares/rate-limit.middleware');
const { createUploadMiddleware } = require('../utils/image-uploader.util');

// Rate limiting untuk semua user routes
router.use(rateLimitMiddleware.userApiLimit);

// Authentication required untuk semua routes
router.use(authMiddleware.protect);

// Create upload middleware for avatar uploads
const avatarUpload = createUploadMiddleware({
  maxSize: 2 * 1024 * 1024 // 2MB for avatars
});

// User profile routes
router
  .route('/me')
  .get(userController.getMyProfile)
  .post(userController.createMyProfile)
  .put(userController.updateMyProfile)
  .delete(userController.deleteMyAccount);

// Avatar upload routes
router
  .route('/me/avatar')
  .post(avatarUpload.single('avatar'), userController.uploadMyAvatar)
  .delete(userController.removeMyAvatar);

// ADMIN ONLY ROUTES
router.use(authMiddleware.restrictTo('admin'));

// GET /api/users - Get all users (ADMIN ONLY)
router.get('/', rateLimitMiddleware.adminApiLimit, userController.getAllUsers);

// GET /api/users/:id - Get specific user (ADMIN ONLY)
router.get('/:id', userController.getUserById);

// PUT /api/users/:id - Update any user (ADMIN ONLY)
router.put('/:id', userController.updateUser);

// DELETE /api/users/:id - Delete any user (ADMIN ONLY)
router.delete('/:id', userController.softDeleteUser);
router.delete('/:id/hard', userController.hardDeleteUser);

// PUT /api/users/:id/role - Change user role (ADMIN ONLY)
router.put('/:id/role', userController.changeUserRole);

// PUT /api/users/:id/status - Activate/Deactivate user (ADMIN ONLY)
router.put('/:id/status', userController.changeUserStatus);

module.exports = router;