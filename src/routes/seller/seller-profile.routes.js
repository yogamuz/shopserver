const express = require("express");
const router = express.Router();
const SellerProfileController = require("../../controllers/seller/seller-profile.controller");
const { roleMiddleware } = require("../../middlewares/role.middleware");
const {
  sellerProfileCache,
  invalidateProfileCache,
  invalidateStoreCache,
  invalidateSellerProductCache, // ← TAMBAHKAN IMPORT INI
} = require("../../middlewares/cache-middleware");
const { upload, handleMulterError } = require("../../middlewares/upload.middleware");

// PROFILE CRUD ROUTES - Chaining style
router
  .route("/")
  .post(roleMiddleware(["seller"]), invalidateProfileCache, invalidateStoreCache, SellerProfileController.createProfile)
  .get(roleMiddleware(["seller"]), sellerProfileCache, SellerProfileController.getProfile)
  .patch(
    roleMiddleware(["seller"]),
    invalidateProfileCache,
    invalidateStoreCache,
    invalidateSellerProductCache, // ← TAMBAHKAN INI (untuk archive/restore/update status)
    SellerProfileController.updateProfile
  )
  .delete(
    roleMiddleware(["seller"]),
    invalidateProfileCache,
    invalidateStoreCache,
    invalidateSellerProductCache, // ← TAMBAHKAN INI (untuk soft delete)
    SellerProfileController.softDeleteProfile
  );

// PROFILE IMAGE ROUTES
router
  .route("/images/logo")
  .post(
    roleMiddleware(["seller"]),
    invalidateProfileCache,
    invalidateStoreCache,
    upload.single("image"),
    handleMulterError,
    SellerProfileController.uploadLogo
  );

router
  .route("/images/banner")
  .post(
    roleMiddleware(["seller"]),
    invalidateProfileCache,
    invalidateStoreCache,
    upload.single("image"),
    handleMulterError,
    SellerProfileController.uploadBanner
  );

module.exports = router;
