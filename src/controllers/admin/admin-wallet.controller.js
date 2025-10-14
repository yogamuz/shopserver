// admin-wallet.controller.js - REVISED

const asyncHandler = require('../../middlewares/asyncHandler');
const AdminWalletService = require('../../services/admin/admin-wallet.service');

class AdminWalletController {
  /**
   * GET /transactions/history - Get all transaction history (top-up, deduct, reversals)
   * REVISED: Removed :userId parameter - now fetches all transactions
   */
  static getTransactionHistory = asyncHandler(async (req, res) => {
    try {
      const result = await AdminWalletService.getTransactionHistory(req.query);
      
      res.json({
        success: true,
        message: 'Transaction history retrieved successfully',
        data: result
      });
    } catch (error) {
      throw error;
    }
  });

  /**
   * POST /:userId/top-up - Top-up user balance
   */
  static topUpBalance = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { amount, description } = req.body;
    const adminId = req.user.userId;

    try {
      const result = await AdminWalletService.topUpBalance(
        userId,
        amount, 
        description || 'Admin top-up', 
        adminId, 
        req
      );

      res.json({
        success: true,
        message: 'Balance topped up successfully',
        data: result
      });
    } catch (error) {
      if (error.message === 'WALLET_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found',
          data: null
        });
      }
      
      if (error.message === 'INVALID_AMOUNT') {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount provided',
          data: null
        });
      }

      if (error.message === 'MAXIMUM_AMOUNT_EXCEEDED') {
        return res.status(400).json({
          success: false,
          message: 'Maximum amount exceeded',
          data: null
        });
      }
      
      throw error;
    }
  });

  /**
   * POST /:userId/deduct - Deduct user balance
   */
  static deductBalance = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { amount, description, reason } = req.body;
    const adminId = req.user.userId;

    try {
      const result = await AdminWalletService.deductBalance(
        userId,
        amount, 
        description || 'Admin deduction', 
        reason, 
        adminId, 
        req
      );

      res.json({
        success: true,
        message: 'Balance deducted successfully',
        data: result
      });
    } catch (error) {
      if (error.message === 'WALLET_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found',
          data: null
        });
      }
      
      if (error.message === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance',
          data: null
        });
      }

      if (error.message === 'REASON_REQUIRED') {
        return res.status(400).json({
          success: false,
          message: 'Reason for deduction is required',
          data: null
        });
      }

      if (error.message === 'INVALID_AMOUNT') {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount provided',
          data: null
        });
      }
      
      throw error;
    }
  });

  /**
   * POST /transactions/:transactionId/reverse - Reverse a transaction
   */
  static reverseTransaction = asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const { reason = 'Admin reversal', confirmReverse = false } = req.body;
    const adminId = req.user.userId;

    try {
      const result = await AdminWalletService.reverseTransaction(
        transactionId, 
        reason, 
        adminId, 
        confirmReverse
      );

      res.json({
        success: true,
        message: 'Transaction reversed successfully',
        data: result
      });
    } catch (error) {
      if (error.message === 'TRANSACTION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
          data: null
        });
      }

      if (error.message === 'CONFIRMATION_REQUIRED') {
        return res.status(400).json({
          success: false,
          message: 'Confirmation is required to reverse transaction',
          data: null
        });
      }
      
      throw error;
    }
  });
}

module.exports = AdminWalletController;