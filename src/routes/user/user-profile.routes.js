const express = require('express');
const router = express.Router();
const UserProfileController = require('../../controllers/user/user-profile.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
// const rateLimitMiddleware = require('../../middlewares/rate-limit.middleware');
const { createUploadMiddleware } = require('../../utils/cloudinary-uploader.util');
const { profileCache, invalidateProfileCache } = require('../../middlewares/cache-middleware');

// router.use(rateLimitMiddleware.userApiLimit);
router.use(authMiddleware.protect);

const avatarUpload = createUploadMiddleware({
  maxSize: 3 * 1024 * 1024
});
const skipBodyParsing = (req, res, next) => {
  req.body = {};
  next();
};
router.route('/me')
  .get(profileCache, UserProfileController.getMyProfile)
  .post(invalidateProfileCache, UserProfileController.createMyProfile)
  .put(invalidateProfileCache, UserProfileController.updateMyProfile)  
  .delete(invalidateProfileCache, UserProfileController.deleteMyAccount);

router.route('/me/avatar')
  .post(avatarUpload.single('avatar'), invalidateProfileCache, UserProfileController.uploadMyAvatar)
  .delete(invalidateProfileCache, UserProfileController.removeMyAvatar);

router.route('/me/addresses')
  .get(profileCache, UserProfileController.getMyAddresses)
  .post(invalidateProfileCache, UserProfileController.addMyAddress);

router.route('/me/addresses/:index')
  .patch(invalidateProfileCache, UserProfileController.updateMyAddress)
  .delete(invalidateProfileCache, UserProfileController.removeMyAddress);

router.patch('/me/addresses/:index/default', 
  skipBodyParsing,
  invalidateProfileCache,
  UserProfileController.setDefaultAddress
);
router.post('/me/upgrade-to-seller', 
  invalidateProfileCache,
  UserProfileController.upgradeToSeller
);

module.exports = router;