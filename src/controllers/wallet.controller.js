// wallet.controller.js
const WalletService = require("../services/wallet.service");
const OrderService = require("../services/order/order.service");
const asyncHandler = require("../middlewares/asyncHandler");

class WalletController {
  /**
   * GET /balance - Get user wallet balance
   */
  static getBalance = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const balanceData = await WalletService.getBalance(userId);

    res.json({
      success: true,
      data: balanceData,
    });
  });

  /**
   * GET /transactions - Get user transaction history
   */
  static getTransactions = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const transactionsData = await WalletService.getTransactions(userId, req.query);

    res.json({
      success: true,
      message: "Wallet transactions retrieved successfully",
      data: transactionsData,
    });
  });

  /**
   * GET /stats - Get transaction statistics
   */
  static getStats = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { period = "30d" } = req.query;

    const stats = await WalletService.getStats(userId, period);

    res.json({
      success: true,
      data: stats,
    });
  });

  /**
   * GET /check-balance/:amount - Check if user has sufficient balance
   */
  static checkBalance = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { amount } = req.params;

    try {
      const balanceCheck = await WalletService.checkBalance(userId, amount);

      res.json({
        success: true,
        data: balanceCheck,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  /**
   * POST /validate-payment - Validate if payment can be processed
   */
  static validatePayment = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { amount, orderId } = req.body;

    try {
      const validationResult = await WalletService.validatePayment(userId, amount, orderId);

      if (!validationResult.canProceed) {
        let message = "Payment validation failed";
        switch (validationResult.reason) {
          case "no_wallet":
            message = "Wallet not found. Please contact support.";
            break;
          case "wallet_inactive":
            message = "Your wallet is currently inactive. Please contact support.";
            break;
          case "insufficient_balance":
            message = "Insufficient balance for this payment";
            break;
        }

        return res.status(400).json({
          success: false,
          message,
          data: validationResult,
        });
      }

      res.json({
        success: true,
        message: "Payment can be processed",
        data: validationResult,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  /**
   * PATCH api/wallet/pin
   */
  static setPin = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { pin, currentPin } = req.body;

    try {
      await WalletService.setPin(userId, pin, currentPin);

      res.json({
        success: true,
        message: "Wallet PIN has been set successfully",
      });
    } catch (error) {
      console.error("Error setting PIN:", error);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  /**
   * POST /:orderId/payment - Pay for order using ShopPay wallet
   * Moved from order.controller.js to wallet.controller.js
   */
  static payOrder = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { pin } = req.body;

    try {
      const result = await OrderService.payOrder(orderId, userId, pin);
      
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        ...(error.code && { code: error.code }),
        ...(error.data && { data: error.data })
      });
    }
  });

  /**
   * GET /:orderId/payment/validate - Validate payment before paying order
   * Moved from order.controller.js to wallet.controller.js
   */
  static validateOrderPayment = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { orderId } = req.params;

    try {
      const result = await OrderService.validatePayment(userId, orderId);
      
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  });
}

module.exports = WalletController;