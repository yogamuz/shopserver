// routes/admin/admin-wallet.routes.js - REVISED

const express = require("express");
const router = express.Router();
const AdminWalletController = require("../../controllers/admin/admin-wallet.controller");

/**
 * REVISED: Transaction History - Now fetches ALL transactions (top-up, deduct, reversals)
 * GET /admin/wallets/transactions/history?page=1&limit=50&type=top_up&dateFrom=&dateTo=
 * 
 * Changes:
 * - Removed :userId parameter (now gets all transactions)
 * - Filtered to show only: top_up, admin_deduct, and reversal transactions
 * - Query params: page, limit, type, dateFrom, dateTo, minAmount, maxAmount, sortBy, sortOrder
 */
router.get("/transactions/history", AdminWalletController.getTransactionHistory);

/**
 * Top-up Balance
 * POST /admin/wallets/:userId/top-up
 * Body: { amount, description }
 */
router.post("/:userId/top-up", AdminWalletController.topUpBalance);

/**
 * Deduct Balance
 * POST /admin/wallets/:userId/deduct
 * Body: { amount, description, reason }
 */
router.post("/:userId/deduct", AdminWalletController.deductBalance);

/**
 * Reverse Transaction
 * POST /admin/wallets/transactions/:transactionId/reverse
 * Body: { reason, confirmReverse }
 */
router.post("/transactions/:transactionId/reverse", AdminWalletController.reverseTransaction);

module.exports = router;