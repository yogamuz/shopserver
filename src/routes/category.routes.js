// categoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { seedCategories, newCategories } = require('../../seeds/seedCategories');
const authMiddleware = require('../middlewares/auth.middleware');
const Category = require('../models/category.model');
const Product = require('../models/products.model');





// Public routes (NO AUTHENTICATION REQUIRED)
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategoryById);
router.get('/:id/products', categoryController.getProductsByCategory);

// Protected routes (AUTHENTICATION REQUIRED)
router.post('/', 
  authMiddleware.protect, 
  authMiddleware.restrictTo('admin'), 
  categoryController.createCategory
);

router.put('/:id', 
  authMiddleware.protect, 
  authMiddleware.restrictTo('admin'), 
  categoryController.updateCategory
);

router.delete('/:id', 
  authMiddleware.protect, 
  authMiddleware.restrictTo('admin'), 
  categoryController.deleteCategory
);

module.exports = router;