const express = require('express');
const router = express.Router();
const WalletController = require('../../controllers/wallet.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const rateLimitMiddleware = require('../../middlewares/rate-limit.middleware');
const { body, param } = require('express-validator');
const { commonValidations, handleValidationErrors } = require('../../validation/common');

// router.use(rateLimitMiddleware.userApiLimit);
router.use(authMiddleware.protect);

// Wallet pin validation - FIXED: Tidak perlu currentPin untuk first time setup
const pinValidation = [
  body('pin').isLength({ min: 6, max: 6 }).isNumeric().withMessage('PIN must be 6 digits'),
  body('currentPin').optional().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Current PIN must be 6 digits if provided')
];

// Payment validation for order payment
const orderPaymentValidation = [
  body('pin').isLength({ min: 6, max: 6 }).isNumeric().withMessage('PIN must be 6 digits')
];

// Payment validation
const paymentValidation = [
  body('amount').isNumeric().isFloat({ min: 0.01 }),
  body('pin').isLength({ min: 6, max: 6 }).isNumeric(),
  body('orderId').optional().isMongoId()
];

router.get('/balance', WalletController.getBalance);
router.get('/transactions', ...commonValidations.pagination(), handleValidationErrors, WalletController.getTransactions);
router.get('/statistics', WalletController.getStats);

router.get('/balance/:amount/validation', 
  param('amount').isNumeric().isFloat({ min: 0.01 }),
  handleValidationErrors,
  WalletController.checkBalance
);

router.post('/payment/validation', 
  paymentValidation,
  handleValidationErrors,
  WalletController.validatePayment
);

// NEW: Order payment endpoint moved from orders routes
router.post('/:orderId/payment', 
  commonValidations.objectId('orderId'), 
  orderPaymentValidation, 
  handleValidationErrors, 
  WalletController.payOrder
);

// NEW: Order payment validation endpoint moved from orders routes  
router.get('/:orderId/payment/validate', 
  commonValidations.objectId('orderId'), 
  handleValidationErrors, 
  WalletController.validateOrderPayment
);

router.patch('/pin', 
  pinValidation,
  handleValidationErrors,
  WalletController.setPin
);

module.exports = router;