// validations/common.js - Reusable validation functions
const { body, param, query } = require('express-validator');

const commonValidations = {
  // Basic validations
  email: () => body('email').isEmail().normalizeEmail(),
  password: () => body('password').isLength({ min: 6, max: 128 }),
  strongPassword: () => body('password').isLength({ min: 6, max: 128 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  username: () => body('username').isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  
  // Object ID validation
  objectId: (field = 'id') => param(field).isMongoId(),
  
  // Product validations
  productName: () => body('name').isLength({ min: 2, max: 100 }).trim(),
  productDescription: () => body('description').isLength({ min: 10, max: 2000 }).trim(),
  productPrice: () => body('price').isNumeric().isFloat({ min: 0 }),
  productStock: () => body('stock').isInt({ min: 0 }),
  
  // Pagination
  pagination: () => [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]
};
// Fixed validation handler - move require to top
const { validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    console.log('Validation errors found:', errors.array()); // Debug log
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

module.exports = { commonValidations, handleValidationErrors };