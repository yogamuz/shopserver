// routes/seller/seller-cancel-request.routes.js
const express = require("express");
const router = express.Router();
const SellerCancelRequestController = require("../../controllers/seller/seller-cancel-req.controller");
const { roleMiddleware } = require("../../middlewares/role.middleware");

// CANCEL REQUEST ROUTES
router.get("/", roleMiddleware(['seller']), SellerCancelRequestController.getPendingRequests);
router.get("/:requestId", roleMiddleware(['seller']), SellerCancelRequestController.getRequestDetails);
router.post("/:requestId/respond", roleMiddleware(['seller']), SellerCancelRequestController.respondToRequest);

module.exports = router;