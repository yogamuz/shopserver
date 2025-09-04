const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);

router.get("/wallet", adminController.getAllWallets);
router.get("/wallets/:userId", adminController.getUserWallet);
router.post("/wallets/:userId/top-up", adminController.topUpBalance);
router.post("/wallets/:userId/deduct", adminController.deductBalance);
router.get("/transactions", adminController.getAllTransactions);
router.get("/stats", adminController.getWalletStats);
router.post(
  "/transactions/:transactionId/reverse",
  adminController.reverseTransaction
);
router.post("/wallets/:userId/activate", adminController.activateWallet);
router.post("/wallets/:userId/deactivate", adminController.deactivateWallet);

module.exports = router;
