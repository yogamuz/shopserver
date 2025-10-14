// seller-cancel-request.controller.js
const CancelRequest = require("../../models/cancel-request.model");
const SellerProfile = require("../../models/seller-profile.model");
const OrderCancellationService = require("../../services/order/order-cancellation.service");
const asyncHandler = require("../../middlewares/asyncHandler");

class SellerCancelRequestController {
  /**
   * GET /cancel-requests - Get pending cancel requests for seller
   */
  static getPendingRequests = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: "Only sellers can access cancel requests",
      });
    }

    const requests = await CancelRequest.getPendingRequestsForSeller(sellerProfile._id, { page, limit });

    const total = await CancelRequest.countDocuments({
      status: "pending",
      requiredSellers: sellerProfile._id,
      "sellerResponses.sellerId": { $ne: sellerProfile._id },
    });

    res.json({
      success: true,
      message: "Cancel requests retrieved successfully",
      data: {
        requests: requests.map(request => ({
          id: request._id,
          reason: request.generalReason || request.reason, // ✅ Cek generalReason dulu
          generalReason: request.generalReason, // ✅ Tambah ini juga
          createdAt: request.createdAt,
          order: {
            orderNumber: request.orderId.orderNumber,
            totalAmount: request.orderId.totalAmount,
            status: request.orderId.status,
            createdAt: request.orderId.createdAt,
          },
          customer: {
            username: request.userId.username,
            email: request.userId.email,
          },
          sellersRequired: request.requiredSellers.length,
          sellersResponded: request.sellerResponses.length,
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRequests: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
        },
      },
    });
  });

  /**
   * POST /cancel-requests/:requestId/respond - Respond to cancel request
   */
  static respondToRequest = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { requestId } = req.params;
    const { itemResponses } = req.body;

    // Validate itemResponses format
    if (!Array.isArray(itemResponses) || itemResponses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "itemResponses must be a non-empty array",
      });
    }

    // Validate each item response
    for (const item of itemResponses) {
      if (!item.productId || !item.response) {
        return res.status(400).json({
          success: false,
          message: "Each item must have productId and response (approved/rejected)",
        });
      }

      if (!["approved", "rejected"].includes(item.response)) {
        return res.status(400).json({
          success: false,
          message: "Response must be 'approved' or 'rejected'",
        });
      }

      // ✅ responseReason is optional, no validation needed
    }

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: "Only sellers can respond to cancel requests",
      });
    }

    const cancelRequest = await CancelRequest.findById(requestId)
      .populate("orderId", "orderNumber totalAmount status")
      .populate("userId", "username email");

    if (!cancelRequest) {
      return res.status(404).json({
        success: false,
        message: "Cancel request not found",
      });
    }

    if (cancelRequest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Cancel request is already processed",
      });
    }

    try {
      await cancelRequest.addSellerItemResponses(sellerProfile._id, itemResponses);

      if (cancelRequest.isAllSellersResponded()) {
        await cancelRequest.processItemLevelRequest();

        const Order = require("../../models/order.model");
        const order = await Order.findById(cancelRequest.orderId._id);

        if (order && (cancelRequest.status === "approved" || cancelRequest.status === "partial")) {
          await OrderCancellationService.processApprovedCancellation(order, cancelRequest);
        }
      }

      const approvedCount = itemResponses.filter(r => r.response === "approved").length;
      const rejectedCount = itemResponses.filter(r => r.response === "rejected").length;

      res.json({
        success: true,
        message: `Cancel request responses submitted successfully`,
        data: {
          requestId: cancelRequest._id,
          yourResponse: {
            itemsApproved: approvedCount,
            itemsRejected: rejectedCount,
            totalItems: itemResponses.length,
          },
          allSellersResponded: cancelRequest.isAllSellersResponded(),
          finalStatus: cancelRequest.isAllSellersResponded() ? cancelRequest.status : "pending",
          order: {
            orderNumber: cancelRequest.orderId.orderNumber,
            totalAmount: cancelRequest.orderId.totalAmount,
          },
        },
      });
    } catch (error) {
      if (error.message.includes("already responded")) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      if (error.message.includes("not required to respond") || error.message.includes("does not own")) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      throw error;
    }
  });

  /**
   * GET /cancel-requests/:requestId - Get cancel request details
   */

  static getRequestDetails = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { requestId } = req.params;

    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: "Only sellers can access cancel request details",
      });
    }

    const cancelRequest = await CancelRequest.findById(requestId)
      .populate("orderId", "orderNumber totalAmount status createdAt cartSnapshot") // ← Specify fields
      .populate("userId", "username email")
      .populate("sellerResponses.sellerId", "storeName storeSlug");

    if (!cancelRequest) {
      return res.status(404).json({
        success: false,
        message: "Cancel request not found",
      });
    }

    const isInvolved = cancelRequest.requiredSellers.some(id => id.equals(sellerProfile._id));

    if (!isInvolved) {
      return res.status(403).json({
        success: false,
        message: "You are not involved in this cancel request",
      });
    }

    const sellerItems = cancelRequest.getSellerItems(sellerProfile._id);

    if (sellerItems.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You have no items in this cancel request",
      });
    }

    const yourResponse = cancelRequest.sellerResponses.find(response =>
      response.sellerId._id.equals(sellerProfile._id)
    );

    res.json({
      success: true,
      message: "Cancel request details retrieved successfully",
      data: {
        id: cancelRequest._id,
        generalReason: cancelRequest.generalReason,
        status: cancelRequest.status,
        createdAt: cancelRequest.createdAt,
        processedAt: cancelRequest.processedAt,
        customer: {
          username: cancelRequest.userId.username,
          email: cancelRequest.userId.email,
        },
        yourItems: sellerItems.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          reason: item.reason,
          priceAtPurchase: item.priceAtPurchase,
          subtotal: item.subtotal,
        })),
        order: {
          orderNumber: cancelRequest.orderId.orderNumber,
          totalAmount: cancelRequest.orderId.totalAmount,
          status: cancelRequest.orderId.status,
          createdAt: cancelRequest.orderId.createdAt,
        },
        yourResponse: yourResponse
          ? {
              itemResponses: yourResponse.itemResponses,
              respondedAt: yourResponse.respondedAt,
            }
          : null,
        allResponses: cancelRequest.sellerResponses.map(response => ({
          seller: {
            storeName: response.sellerId.storeName,
            storeSlug: response.sellerId.storeSlug,
          },
          itemResponses: response.itemResponses,
          respondedAt: response.respondedAt,
        })),
        responseStats: {
          required: cancelRequest.requiredSellers.length,
          responded: cancelRequest.sellerResponses.length,
        },
      },
    });
  });
}

module.exports = SellerCancelRequestController;
