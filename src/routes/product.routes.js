const express = require("express");
const router = express.Router();
const productController = require("../controllers/product.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const Product = require("../models/products.model");

// Public routes (NO AUTHENTICATION REQUIRED)
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);

// Protected routes (AUTHENTICATION REQUIRED)
router.post(
  "/",
  authMiddleware.protect,
  authMiddleware.restrictTo("seller"),
  productController.createProduct
);

router.put(
  "/:id",
  authMiddleware.protect,
  authMiddleware.restrictTo("seller"),
  productController.updateProduct
);

router.delete(
  "/:id",
  authMiddleware.protect,
  authMiddleware.restrictTo("admin"),
  productController.deleteProduct
);

module.exports = router;
