// order.controller.js - UPDATED WITH SHOPPAY INTEGRATION
const Order = require("../models/order.model");
const Cart = require("../models/cart.model");
const Product = require("../models/products.model");
const Wallet = require("../models/wallet.model");
const WalletTransaction = require("../models/wallet-transaction.model");
const SellerProfile = require("../models/seller-profile.model");
const asyncHandler = require("../middlewares/asyncHandler");

class OrderController {
  /**
   * POST / - Create order from cart with ShopPay integration
   */
  static createOrder = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const {
      shippingAddress,
      paymentMethod,
      notes = "",
      useProfileAddress,
    } = req.body;

    // Validasi input
    if (!shippingAddress || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Shipping address and payment method are required",
      });
    }

    // Validasi payment method hanya ShopPay
    if (paymentMethod !== 'shop_pay') {
      return res.status(400).json({
        success: false,
        message: "Only ShopPay payment method is supported",
      });
    }

    // Ambil cart user dengan populate lengkap
    const cart = await Cart.findByUser(userId).populate({
      path: "items.product",
      populate: [
        {
          path: "category",
          select: "name description",
        },
        {
          path: "sellerId",
          select: "storeName storeSlug userId", // Tambah userId untuk seller
        },
      ],
    });

    if (!cart || !cart.items.length) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // Validasi stock produk
    for (const item of cart.items) {
      if (item.product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.product.title}. Available: ${item.product.stock}, Requested: ${item.quantity}`,
        });
      }
    }

    // Calculate total amount
    const totalAmount = cart.calculateFinalPrice();

    // *** SHOPPAY VALIDATION ***
    // Check user wallet balance
    const userWallet = await Wallet.findByUser(userId);
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        message: "ShopPay wallet not found. Please contact support.",
      });
    }

    if (!userWallet.isActive) {
      return res.status(400).json({
        success: false,
        message: "Your ShopPay wallet is inactive. Please contact support.",
      });
    }

    if (!userWallet.hasSufficientBalance(totalAmount)) {
      return res.status(400).json({
        success: false,
        message: "Insufficient ShopPay balance",
        data: {
          currentBalance: userWallet.balance,
          requiredAmount: totalAmount,
          shortfall: totalAmount - userWallet.balance
        }
      });
    }

    // Prepare cart data
    const cartData = {
      _id: cart._id,
      items: cart.items.map((item) => ({
        product: {
          _id: item.product._id,
          title: item.product.title,
          description: item.product.description,
          image: item.product.image,
          category: {
            _id: item.product.category._id,
            name: item.product.category.name,
            description: item.product.category.description,
          },
          seller: item.product.sellerId
            ? {
                _id: item.product.sellerId._id,
                storeName: item.product.sellerId.storeName,
                storeSlug: item.product.sellerId.storeSlug,
              }
            : null,
        },
        quantity: item.quantity,
        priceAtAddition: item.priceAtAddition,
      })),
      appliedCoupon: cart.appliedCoupon,
      totalItems: cart.totalItems,
      totalPrice: cart.calculateTotal(),
      finalPrice: cart.calculateFinalPrice(),
    };

    // Create order first
    const order = await Order.createFromCart(userId, cartData, {
      shippingAddress,
      useProfileAddress,
      paymentMethod,
      notes,
    });

    try {
      // *** PROCESS SHOPPAY PAYMENT ***
      // Group items by seller untuk transfer ke masing-masing seller
      const sellerPayments = new Map();
      
      for (const item of cart.items) {
        if (!item.product.sellerId) continue;
        
        const sellerId = item.product.sellerId.userId; // Get actual user ID of seller
        const amount = item.priceAtAddition * item.quantity;
        
        if (sellerPayments.has(sellerId.toString())) {
          sellerPayments.set(sellerId.toString(), sellerPayments.get(sellerId.toString()) + amount);
        } else {
          sellerPayments.set(sellerId.toString(), amount);
        }
      }

      // Process payments to each seller
      const paymentPromises = [];
      for (const [sellerId, amount] of sellerPayments) {
        // Ensure seller has wallet
        let sellerWallet = await Wallet.findByUser(sellerId);
        if (!sellerWallet) {
          sellerWallet = await Wallet.createWallet(sellerId);
        }

        // Transfer payment using Wallet.transfer (user -> seller pending)
        paymentPromises.push(
          Wallet.transfer(
            userId, 
            sellerId, 
            amount, 
            order._id, 
            `Payment for order ${order.orderNumber}`
          )
        );
      }

      // Execute all payments
      await Promise.all(paymentPromises);

      // Mark order as paid and set status to 'packed'
      await order.markAsPaid({
        transactionId: `SP_${order.orderNumber}_${Date.now()}`,
        paymentGateway: 'ShopPay'
      });

      // Set order status to 'packed' (instead of auto-confirm)
      order.status = 'packed';
      order.timestamps.packedAt = new Date();
      await order.save();

      // Update stock produk
      for (const item of cart.items) {
        await item.product.updateOne({
          $inc: { stock: -item.quantity },
        });
      }

      // Clear cart setelah order berhasil
      cart.items = [];
      cart.appliedCoupon = undefined;
      await cart.save();

      // Populate user info untuk response
      await order.populate("user", "username email");

      res.status(201).json({
        success: true,
        message: "Order created and paid successfully with ShopPay",
        data: {
          order,
          paymentInfo: {
            method: 'ShopPay',
            amount: totalAmount,
            remainingBalance: userWallet.balance - totalAmount
          }
        }
      });

    } catch (error) {
      // Jika payment gagal, cancel order
      await order.cancel('Payment failed: ' + error.message);
      
      return res.status(500).json({
        success: false,
        message: "Payment processing failed: " + error.message,
      });
    }
  });

  /**
   * PATCH /:orderId/ship - Ship order (seller action) 
   */
  static shipOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { trackingNumber, courier, estimatedDelivery } = req.body;
    const userId = req.user._id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user is seller of any item in this order
    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: "Only sellers can ship orders",
      });
    }

    // Verify seller owns products in this order
    const sellerOwnsProduct = order.cartSnapshot.items.some(item => 
      item.productSnapshot.seller && 
      item.productSnapshot.seller._id.equals(sellerProfile._id)
    );

    if (!sellerOwnsProduct) {
      return res.status(403).json({
        success: false,
        message: "You can only ship orders containing your products",
      });
    }

    // Check if order can be shipped
    if (order.status !== 'packed') {
      return res.status(400).json({
        success: false,
        message: "Order must be in 'packed' status to ship",
      });
    }

    // Ship order
    await order.ship({
      trackingNumber,
      courier,
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null
    });

    // Set auto-delivery timer (1 hour = 3600000 ms)
    setTimeout(async () => {
      try {
        const currentOrder = await Order.findById(orderId);
        if (currentOrder && currentOrder.status === 'shipped') {
          await OrderController.autoDeliverOrder(currentOrder);
        }
      } catch (error) {
        console.error('Auto-delivery error for order:', orderId, error);
      }
    }, 3600000); // 1 hour

    res.json({
      success: true,
      message: "Order shipped successfully. Auto-delivery scheduled in 1 hour.",
      data: order
    });
  });

  /**
   * Auto-deliver order (internal method)
   */
  static autoDeliverOrder = async (order) => {
    try {
      // Mark as delivered
      await order.deliver();

      // *** CONFIRM SELLER PAYMENTS ***
      // Find all pending transactions for this order
      const pendingTransactions = await WalletTransaction.find({
        orderId: order._id,
        type: 'receive_pending',
        status: 'completed'
      });

      // Convert pending balance to available balance for each seller
      for (const transaction of pendingTransactions) {
        const sellerWallet = await Wallet.findByUser(transaction.userId);
        if (sellerWallet && sellerWallet.pendingBalance >= transaction.amount) {
          // Confirm pending balance
          await sellerWallet.confirmPendingBalance(
            transaction.amount, 
            `Order delivered: ${order.orderNumber}`
          );

          // Create confirmation transaction
          await WalletTransaction.create({
            userId: transaction.userId,
            type: 'receive_confirmed',
            amount: transaction.amount,
            description: `Payment confirmed - Order ${order.orderNumber} delivered`,
            orderId: order._id,
            balanceAfter: sellerWallet.balance,
            pendingBalanceAfter: sellerWallet.pendingBalance,
            metadata: {
              source: 'auto_delivery',
              originalTransactionId: transaction._id
            }
          });
        }
      }

      console.log(`Order ${order.orderNumber} auto-delivered and seller payments confirmed`);
    } catch (error) {
      console.error('Auto-delivery process failed:', error);
    }
  };

  /**
   * GET / - Get user orders (updated untuk include payment info)
   */
  static getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const orders = await Order.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("user", "username email");

    const total = await Order.countDocuments(query);

    // Add payment method info to each order
    const ordersWithPaymentInfo = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.paymentInfo = {
        method: 'ShopPay',
        status: order.paymentStatus,
        paidAt: order.paymentDetails?.paidAt
      };
      return orderObj;
    });

    res.json({
      success: true,
      data: {
        orders: ordersWithPaymentInfo,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalOrders: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
        },
      },
    });
  });

  /**
   * GET /:orderId - Get order details (updated)
   */
  static getOrderById = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    }).populate("user", "username email");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Add payment info
    const orderObj = order.toObject();
    orderObj.paymentInfo = {
      method: 'ShopPay',
      status: order.paymentStatus,
      paidAt: order.paymentDetails?.paidAt,
      transactionId: order.paymentDetails?.transactionId
    };

    res.json({
      success: true,
      data: orderObj,
    });
  });

  /**
   * PATCH /:orderId/cancel - Cancel order (updated untuk handle refund)
   */
  static cancelOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user._id;
    const { reason } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    if (!["pending", "packed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    // *** SHOPPAY REFUND PROCESS ***
    if (order.paymentStatus === 'paid') {
      try {
        // Refund to user wallet
        const userWallet = await Wallet.findByUser(userId);
        if (userWallet) {
          await userWallet.addBalance(
            order.totalAmount, 
            `Refund for cancelled order ${order.orderNumber}`
          );

          // Create refund transaction
          await WalletTransaction.create({
            userId,
            type: 'refund',
            amount: order.totalAmount,
            description: `Refund - Order ${order.orderNumber} cancelled`,
            orderId: order._id,
            balanceAfter: userWallet.balance,
            pendingBalanceAfter: userWallet.pendingBalance
          });
        }

        // Cancel pending seller payments
        const pendingTransactions = await WalletTransaction.find({
          orderId: order._id,
          type: 'receive_pending',
          status: 'completed'
        });

        for (const transaction of pendingTransactions) {
          const sellerWallet = await Wallet.findByUser(transaction.userId);
          if (sellerWallet) {
            await sellerWallet.cancelPendingBalance(
              transaction.amount,
              `Order cancelled: ${order.orderNumber}`
            );
          }
        }

        // Update payment status
        order.paymentStatus = 'refunded';
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "Failed to process refund: " + error.message,
        });
      }
    }

    // Cancel order
    await order.cancel(reason);

    // Restore stock
    for (const item of order.cartSnapshot.items) {
      await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } }
      );
    }

    res.json({
      success: true,
      message: "Order cancelled successfully" + (order.paymentStatus === 'refunded' ? " and refund processed" : ""),
      data: order,
    });
  });

  /**
   * GET /seller - Get orders for seller
   */
  static getSellerOrders = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Check if user is seller
    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: "Only sellers can access this endpoint",
      });
    }

    // Find orders containing seller's products
    const query = {
      'cartSnapshot.items.productSnapshot.seller._id': sellerProfile._id
    };
    
    if (status) {
      query.status = status;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const orders = await Order.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("user", "username email");

    const total = await Order.countDocuments(query);

    // Filter items to show only seller's products and add earnings info
    const sellerOrders = await Promise.all(orders.map(async (order) => {
      const orderObj = order.toObject();
      
      // Filter items to only seller's products
      orderObj.cartSnapshot.items = orderObj.cartSnapshot.items.filter(item => 
        item.productSnapshot.seller && 
        item.productSnapshot.seller._id.equals(sellerProfile._id)
      );

      // Calculate seller's earnings from this order
      const sellerEarnings = orderObj.cartSnapshot.items.reduce((total, item) => {
        return total + (item.priceAtPurchase * item.quantity);
      }, 0);

      // Get payment status for seller
      const pendingTransaction = await WalletTransaction.findOne({
        userId: userId,
        orderId: order._id,
        type: 'receive_pending'
      });

      const confirmedTransaction = await WalletTransaction.findOne({
        userId: userId,
        orderId: order._id,
        type: 'receive_confirmed'
      });

      orderObj.sellerInfo = {
        earnings: sellerEarnings,
        paymentStatus: confirmedTransaction ? 'confirmed' : 
                      pendingTransaction ? 'pending' : 'not_paid',
        canShip: order.status === 'packed',
        itemsCount: orderObj.cartSnapshot.items.length
      };

      return orderObj;
    }));

    res.json({
      success: true,
      data: {
        orders: sellerOrders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalOrders: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
        },
      },
    });
  });

  /**
   * GET /seller/earnings - Get seller earnings summary
   */
  static getSellerEarnings = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { period = '30d' } = req.query;

    // Check if user is seller
    const sellerProfile = await SellerProfile.findOne({ userId });
    if (!sellerProfile) {
      return res.status(403).json({
        success: false,
        message: "Only sellers can access earnings data",
      });
    }

    // Get wallet info
    const wallet = await Wallet.findByUser(userId);
    
    // Calculate date range for period
    const endDate = new Date();
    const startDate = new Date();
    
    switch(period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get earning transactions
    const [pendingEarnings, confirmedEarnings] = await Promise.all([
      WalletTransaction.find({
        userId,
        type: 'receive_pending',
        createdAt: { $gte: startDate }
      }).populate('orderId', 'orderNumber status'),
      
      WalletTransaction.find({
        userId,
        type: 'receive_confirmed',
        createdAt: { $gte: startDate }
      }).populate('orderId', 'orderNumber status')
    ]);

    const summary = {
      period,
      wallet: {
        availableBalance: wallet?.balance || 0,
        pendingBalance: wallet?.pendingBalance || 0,
        totalBalance: (wallet?.balance || 0) + (wallet?.pendingBalance || 0)
      },
      earnings: {
        pending: {
          amount: pendingEarnings.reduce((sum, t) => sum + t.amount, 0),
          count: pendingEarnings.length,
          transactions: pendingEarnings
        },
        confirmed: {
          amount: confirmedEarnings.reduce((sum, t) => sum + t.amount, 0),
          count: confirmedEarnings.length,
          transactions: confirmedEarnings
        }
      }
    };

    res.json({
      success: true,
      data: summary
    });
  });

  /**
   * PATCH /:orderNumber/payment-status - Update payment status (for payment gateway webhook)
   * Note: This is kept for compatibility but not used with ShopPay
   */
  static updatePaymentStatus = asyncHandler(async (req, res) => {
    const { orderNumber } = req.params;
    const { status, transactionId, paymentGateway } = req.body;

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Only allow updates for non-ShopPay orders
    if (order.paymentMethod === 'shop_pay') {
      return res.status(400).json({
        success: false,
        message: "ShopPay orders are processed automatically",
      });
    }

    if (status === "paid") {
      await order.markAsPaid({
        transactionId,
        paymentGateway,
      });

      // Auto confirm order setelah pembayaran berhasil
      if (order.status === "pending") {
        await order.confirm();
      }
    } else if (status === "failed") {
      order.paymentStatus = "failed";
      await order.save();
    }

    res.json({
      success: true,
      message: "Payment status updated",
      data: order,
    });
  });

  /**
   * GET /payment/validate - Validate payment before creating order
   */
  static validatePayment = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { amount } = req.query;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    // Check wallet
    const wallet = await Wallet.findByUser(userId);
    
    if (!wallet) {
      return res.json({
        success: true,
        data: {
          canPay: false,
          reason: 'no_wallet',
          message: 'ShopPay wallet not found. Please contact support.'
        }
      });
    }

    if (!wallet.isActive) {
      return res.json({
        success: true,
        data: {
          canPay: false,
          reason: 'wallet_inactive',
          message: 'Your ShopPay wallet is inactive. Please contact support.'
        }
      });
    }

    const canPay = wallet.hasSufficientBalance(parseFloat(amount));

    res.json({
      success: true,
      data: {
        canPay,
        reason: canPay ? 'sufficient_balance' : 'insufficient_balance',
        message: canPay ? 'Payment can be processed' : 'Insufficient ShopPay balance',
        currentBalance: wallet.balance,
        requiredAmount: parseFloat(amount),
        shortfall: canPay ? 0 : parseFloat(amount) - wallet.balance
      }
    });
  });
}

module.exports = OrderController;