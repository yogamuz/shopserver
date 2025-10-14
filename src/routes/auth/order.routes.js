// order.routes.js
const express = require("express");
const OrderController = require("../../controllers/user/order.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const rateLimitMiddleware = require("../../middlewares/rate-limit.middleware");
const { body, param } = require("express-validator");
const { commonValidations, handleValidationErrors } = require("../../validation/common");

const router = express.Router();

// router.use(rateLimitMiddleware.userApiLimit);
router.use(authMiddleware.protect);

// Order creation validation
const orderValidation = [body("paymentMethod").isIn(["shop_pay"]).withMessage("Invalid payment method")];

// Payment validation - COMMENTED for future gateway implementation
// const paymentValidation = [
//   body('pin').isLength({ min: 6, max: 6 }).isNumeric()
// ];

router
  .route("/")
  .get(...commonValidations.pagination(), handleValidationErrors, OrderController.getUserOrders)
  .post(orderValidation, handleValidationErrors, OrderController.createOrder);

router.get("/:orderId", commonValidations.objectId("orderId"), handleValidationErrors, OrderController.getOrderById);

router.patch(
  "/:orderId/cancel",
  commonValidations.objectId("orderId"),
  handleValidationErrors,
  OrderController.cancelOrder
);
router.patch(
  "/:orderId/feedback",
  commonValidations.objectId("orderId"),
  [body("rating").optional().isInt({ min: 1, max: 5 }), body("review").optional().isLength({ min: 10, max: 1000 })],
  handleValidationErrors,
  OrderController.updateOrderFeedback
);

router.patch(
  "/:orderId/items/received",
  commonValidations.objectId("orderId"),
  [
    body("productIds").optional().isArray().withMessage("productIds must be an array"),
    body("productIds.*").optional().isMongoId().withMessage("Invalid product ID"),
    body("sellerId").optional().isMongoId().withMessage("Invalid seller ID"),
    body("rating").optional().isInt({ min: 1, max: 5 }),
    body("review").optional().isLength({ min: 10, max: 1000 })
  ],
  handleValidationErrors,
  OrderController.confirmItemsDelivery
);

router.patch(
  "/:orderId/items/:productId/review",
  commonValidations.objectId("orderId"),
  commonValidations.objectId("productId"),
  [body("rating").optional().isInt({ min: 1, max: 5 }), body("review").optional().isLength({ min: 10, max: 1000 })],
  handleValidationErrors,
  OrderController.updateProductReview
);

module.exports = router;
