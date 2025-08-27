const express = require("express");
const router = express.Router();
const multer = require("multer");

// Controllers
const sellerProfileController = require("../controllers/seller-profile.controller");
const sellerProductController = require("../controllers/seller-product.controller");

// Middlewares
const { protect: authMiddleware } = require("../middlewares/auth.middleware");
const { roleMiddleware } = require("../middlewares/role.middleware");

// Multer configuration for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB'
      });
    }
  }
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed'
    });
  }
  next(error);
};

// Public routes (no auth required)
router.get("/stores", sellerProfileController.getAllStores);
router.get("/stores/:slug", sellerProfileController.getPublicProfile);
router.get("/stores/:slug/products", sellerProductController.getStoreProducts);

// Protected routes (auth required)
router.use(authMiddleware);

// Seller profile management routes - SELLER ONLY
router.post("/profile", roleMiddleware(['seller']), sellerProfileController.createProfile);
router.get("/profile", roleMiddleware(['seller']), sellerProfileController.getProfile);
router.put("/profile", roleMiddleware(['seller']), sellerProfileController.updateProfile);
router.patch("/profile/archive", roleMiddleware(['seller']), sellerProfileController.archiveProfile);
router.patch("/profile/restore", roleMiddleware(['seller']), sellerProfileController.restoreProfile);
router.delete("/profile", roleMiddleware(['seller']), sellerProfileController.softDeleteProfile);

// Image upload routes - SELLER ONLY
router.post("/profile/upload/:imageType", 
  roleMiddleware(['seller']), 
  upload.single('image'), 
  handleMulterError,
  sellerProfileController.uploadStoreImage
);

// Product management routes for sellers - SELLER ONLY  
router.post("/products", roleMiddleware(['seller']), sellerProductController.createProduct);
router.get("/products", roleMiddleware(['seller']), sellerProductController.getSellerProducts);
router.get("/products/:productId", roleMiddleware(['seller']), sellerProductController.getSellerProduct);
router.put("/products/:productId", roleMiddleware(['seller']), sellerProductController.updateProduct);
router.patch("/products/:productId/status", roleMiddleware(['seller']), sellerProductController.updateProductStatus);
router.delete("/products/:productId", roleMiddleware(['seller']), sellerProductController.deleteProduct);

// Bulk operations - SELLER ONLY
router.patch("/products/bulk/status", roleMiddleware(['seller']), sellerProductController.bulkUpdateProductStatus);
router.delete("/products/bulk", roleMiddleware(['seller']), sellerProductController.bulkDeleteProducts);

// Analytics and stats routes - SELLER ONLY
router.get("/analytics/dashboard", roleMiddleware(['seller']), sellerProductController.getDashboardStats);
router.get("/analytics/products", roleMiddleware(['seller']), sellerProductController.getProductStats);

// Product image upload - SELLER ONLY
router.post("/products/:productId/upload-image", 
  roleMiddleware(['seller']), 
  upload.single('image'), 
  handleMulterError,
  sellerProductController.uploadProductImage
);

// Admin only routes
router.get("/admin/profiles", roleMiddleware(['admin']), sellerProfileController.getAllStores);
router.get("/admin/profiles/:profileId", roleMiddleware(['admin']), sellerProfileController.getAdminProfileDetail); // TAMBAH INI
router.delete("/admin/profiles/:profileId/soft", roleMiddleware(['admin']), sellerProfileController.adminSoftDeleteProfile);
router.put("/admin/profiles/:profileId/activate", roleMiddleware(['admin']), sellerProfileController.adminActivateProfile);
router.delete("/admin/profiles/:profileId", roleMiddleware(['admin']), sellerProfileController.hardDeleteProfile);

module.exports = router;