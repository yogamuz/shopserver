// order-response-formatter.service.js - ENHANCED VERSION
const OrderStatusService = require("./order-status.service");

class OrderResponseFormatter {
  /**
   * Clean order response - remove unnecessary fields
   */
  static cleanOrderResponse(order) {
    const orderObj = order.toObject ? order.toObject() : order;

    // Remove unnecessary fields
    delete orderObj._id;
    delete orderObj.__v;
    if (orderObj.user) {
      delete orderObj.user._id;
      delete orderObj.user.__v;
    }

    // Clean cart snapshot items
    if (orderObj.cartSnapshot && orderObj.cartSnapshot.items) {
      orderObj.cartSnapshot.items = orderObj.cartSnapshot.items.map(item => {
        const cleanItem = { ...item };
        delete cleanItem._id;
        delete cleanItem.__v;

        if (cleanItem.product) {
          delete cleanItem.product._id;
          delete cleanItem.product.__v;
        }

        if (cleanItem.productSnapshot) {
          delete cleanItem.productSnapshot._id;
          delete cleanItem.productSnapshot.__v;

          if (cleanItem.productSnapshot.category) {
            delete cleanItem.productSnapshot.category._id;
            delete cleanItem.productSnapshot.category.__v;
          }

          if (cleanItem.productSnapshot.seller) {
            delete cleanItem.productSnapshot.seller._id;
            delete cleanItem.productSnapshot.seller.__v;
          }
        }

        return cleanItem;
      });
    }

    return orderObj;
  }

  static formatOrderResponse(order, includePaymentInfo = true, includeReviews = true) {
    const cleanOrder = this.cleanOrderResponse(order);

    // ✅ Calculate dynamic order status from parcels
    const dynamicOrderStatus = this.calculateDynamicOrderStatus(cleanOrder);

    const response = {
      id: cleanOrder.id || order._id,
      orderNumber: cleanOrder.orderNumber,
      status: dynamicOrderStatus, // ← Dynamic based on parcels
      paymentStatus: cleanOrder.paymentStatus,
      totalAmount: cleanOrder.cartSnapshot.finalPrice,
      createdAt: cleanOrder.createdAt,
      user: cleanOrder.user
        ? {
            username: cleanOrder.user.username,
            email: cleanOrder.user.email,
          }
        : null,
      shippingAddress: cleanOrder.shippingAddress,

      // Di dalam method formatOrderResponse, bagian parcels mapping
      // CARI bagian ini (sekitar line 60-90):

      // DI order-response-formatter.service.js
      // REPLACE bagian parcels mapping (sekitar line 50-95)
      parcels: cleanOrder.parcels
        ? cleanOrder.parcels.map(parcel => {
            const parcelItems = cleanOrder.cartSnapshot.items
              .filter(item => parcel.items.some(pid => pid.toString() === item.product.toString()))
              .map(item => {
                const itemStatus = cleanOrder.itemStatuses?.find(
                  is => is.product.toString() === item.product.toString()
                );

                // ✅ FIX: Ambil customerFeedback SEBELUM clean
                // Cari dari order asli (props parameter), bukan cleanOrder
                const originalItem = order.cartSnapshot?.items?.find(
                  origItem => origItem.product.toString() === item.product.toString()
                );

                const customerFeedback = originalItem?.customerFeedback
                  ? {
                      rating: originalItem.customerFeedback.rating || null,
                      review: originalItem.customerFeedback.review || null,
                      submittedAt: originalItem.customerFeedback.submittedAt || null,
                      updatedAt: originalItem.customerFeedback.updatedAt || null,
                    }
                  : null;

                return {
                  productId: item.product,
                  productName: item.productSnapshot.title,
                  productImage: item.productSnapshot?.image,
                  quantity: item.quantity,
                  price: item.priceAtPurchase,
                  subtotal: item.priceAtPurchase * item.quantity,
                  status: itemStatus?.status || parcel.status,
                  customerFeedback: customerFeedback, // ✅ Data dari order asli
                };
              });

            const firstItem = cleanOrder.cartSnapshot.items.find(item =>
              parcel.items.some(pid => pid.toString() === item.product.toString())
            );

            const itemStatuses = parcelItems.map(i => i.status);
            const parcelStatus = this.calculateParcelStatus(itemStatuses);
            const allItemsDelivered = itemStatuses.every(s => s === "delivered");

            // ✅ TAMBAHKAN BARIS INI - Hitung subtotal parcel
            const parcelSubtotal = parcelItems.reduce((sum, item) => sum + item.subtotal, 0);

            return {
              parcelId: parcel.parcelId,
              seller: {
                storeName: firstItem?.productSnapshot?.seller?.storeName || "Unknown Store",
                storeSlug: firstItem?.productSnapshot?.seller?.storeSlug,
                storeLogo: firstItem.productSnapshot.seller.storeLogo,
              },
              status: parcelStatus,
              subtotal: parcelSubtotal, // ✅ TAMBAHKAN FIELD INI
              trackingNumber: parcel.trackingNumber,
              courier: parcel.courier,
              estimatedDelivery: parcel.estimatedDelivery,
              items: parcelItems,
              timestamps: parcel.timestamps,
              canTrack: !!parcel.trackingNumber || ["shipped", "delivered"].includes(parcelStatus),
              canCancel: ["pending", "packed"].includes(parcelStatus) && !parcel.timestamps?.receivedAt,
              canConfirmDelivery: allItemsDelivered && !parcel.timestamps?.receivedAt,
            };
          })
        : [],

      // ✅ Enhanced timestamps
      timestamps: {
        orderedAt: cleanOrder.timestamps.orderedAt,
        ...(cleanOrder.paymentDetails?.paidAt && { paidAt: cleanOrder.paymentDetails.paidAt }),
        ...(cleanOrder.timestamps.packedAt && { packedAt: cleanOrder.timestamps.packedAt }),
        ...(cleanOrder.timestamps.shippedAt && { shippedAt: cleanOrder.timestamps.shippedAt }),
        ...(cleanOrder.timestamps.deliveredAt && { deliveredAt: cleanOrder.timestamps.deliveredAt }),
        ...(cleanOrder.timestamps.receivedAt && { receivedAt: cleanOrder.timestamps.receivedAt }),
      },

      statusInfo: this.getEnhancedStatusInfo(dynamicOrderStatus, cleanOrder),
    };

    if (includePaymentInfo) {
      response.paymentInfo = {
        method: "ShopPay",
        status: cleanOrder.paymentStatus,
        paidAt: cleanOrder.paymentDetails?.paidAt,
        transactionId: cleanOrder.paymentDetails?.transactionId,
      };
    }

    if (cleanOrder.notes) {
      response.notes = cleanOrder.notes;
    }

    if (cleanOrder.cartSnapshot.appliedCoupon) {
      response.couponApplied = {
        code: cleanOrder.cartSnapshot.appliedCoupon.code,
        discountAmount: cleanOrder.cartSnapshot.appliedCoupon.discountAmount,
      };
    }

    if (cleanOrder.customerFeedback) {
      response.customerFeedback = {
        rating: cleanOrder.customerFeedback.rating,
        review: cleanOrder.customerFeedback.review,
        submittedAt: cleanOrder.customerFeedback.submittedAt,
        hasProductReviews: cleanOrder.customerFeedback.hasProductReviews || false,
        productReviewsCount: cleanOrder.customerFeedback.productReviewsCount || 0,
        hasRating: cleanOrder.customerFeedback.rating !== null && cleanOrder.customerFeedback.rating !== undefined,
        hasReview: !!cleanOrder.customerFeedback.review,
        hasFeedback:
          (cleanOrder.customerFeedback.rating !== null && cleanOrder.customerFeedback.rating !== undefined) ||
          !!cleanOrder.customerFeedback.review ||
          cleanOrder.customerFeedback.productReviewsCount > 0,
      };
    }

    if (cleanOrder.cancelRequest && cleanOrder.cancelRequest.id) {
      response.cancelRequest = {
        id: cleanOrder.cancelRequest.id,
        reason: cleanOrder.cancelRequest.reason,
        status: cleanOrder.cancelRequest.status,
        submittedAt: cleanOrder.cancelRequest.submittedAt,
        processedAt: cleanOrder.cancelRequest.processedAt,
      };
    }

    return response;
  }

  /**
   * ✅ NEW: Calculate parcel status from item statuses
   */
  static calculateParcelStatus(itemStatuses) {
    if (itemStatuses.length === 0) return "pending";

    const uniqueStatuses = [...new Set(itemStatuses)];

    // All items same status
    if (uniqueStatuses.length === 1) {
      return uniqueStatuses[0];
    }

    // Mixed statuses - return most advanced
    if (itemStatuses.some(s => s === "delivered")) return "delivered";
    if (itemStatuses.some(s => s === "shipped")) return "shipped";
    if (itemStatuses.some(s => s === "packed")) return "packed";

    return "pending";
  }

  /**
   * ✅ NEW: Calculate dynamic order status from parcels
   */
  static calculateDynamicOrderStatus(order) {
    // Payment not completed
    if (order.paymentStatus === "pending") return "pending";

    // No parcels - fallback to order status
    if (!order.parcels || order.parcels.length === 0) return order.status;

    // Get all item statuses
    const allItemStatuses = order.itemStatuses?.map(is => is.status) || [];

    if (allItemStatuses.length === 0) return order.status;

    const uniqueStatuses = [...new Set(allItemStatuses)];

    // All items received
    if (uniqueStatuses.length === 1 && uniqueStatuses[0] === "received") {
      return "received";
    }

    // All items delivered
    if (uniqueStatuses.length === 1 && uniqueStatuses[0] === "delivered") {
      return "delivered";
    }

    // All items shipped
    if (uniqueStatuses.length === 1 && uniqueStatuses[0] === "shipped") {
      return "shipped";
    }

    // All items packed
    if (uniqueStatuses.length === 1 && uniqueStatuses[0] === "packed") {
      return "packed";
    }

    // Mixed statuses - return "processing"
    return "processing";
  }

  /**
   * ✅ NEW: Enhanced status info with parcel context
   */
  static getEnhancedStatusInfo(status, order) {
    const allItemStatuses = order.itemStatuses?.map(is => is.status) || [];
    const hasDelivered = allItemStatuses.some(s => s === "delivered");
    const hasShipped = allItemStatuses.some(s => s === "shipped");
    const canCancel = allItemStatuses.every(s => ["pending", "packed"].includes(s));

    const statusMap = {
      pending: {
        status: "pending",
        displayStatus: "Menunggu Pembayaran",
        canCancel: true,
        canPay: true,
        canShip: false,
        canDeliver: false,
        canConfirmDelivery: false,
        isCompleted: false,
        isCancelled: false,
        isActive: true,
        needsCustomerAction: true,
      },
      processing: {
        status: "processing",
        displayStatus: "Pesanan Diproses",
        canCancel: canCancel,
        canPay: false,
        canShip: true,
        canDeliver: false,
        canConfirmDelivery: hasDelivered,
        isCompleted: false,
        isCancelled: false,
        isActive: true,
        needsCustomerAction: hasDelivered,
      },
      packed: {
        status: "packed",
        displayStatus: "Sedang Dikemas",
        canCancel: true,
        canPay: false,
        canShip: true,
        canDeliver: false,
        canConfirmDelivery: false,
        isCompleted: false,
        isCancelled: false,
        isActive: true,
        needsCustomerAction: false,
      },
      shipped: {
        status: "shipped",
        displayStatus: "Sedang Dikirim",
        canCancel: false,
        canPay: false,
        canShip: false,
        canDeliver: true,
        canConfirmDelivery: false,
        isCompleted: false,
        isCancelled: false,
        isActive: true,
        needsCustomerAction: false,
      },
      delivered: {
        status: "delivered",
        displayStatus: "Sudah Sampai",
        canCancel: false,
        canPay: false,
        canShip: false,
        canDeliver: false,
        canConfirmDelivery: true,
        isCompleted: false,
        isCancelled: false,
        isActive: true,
        needsCustomerAction: true,
      },
      received: {
        status: "received",
        displayStatus: "Selesai",
        canCancel: false,
        canPay: false,
        canShip: false,
        canDeliver: false,
        canConfirmDelivery: false,
        isCompleted: true,
        isCancelled: false,
        isActive: false,
        needsCustomerAction: false,
      },
      cancelled: {
        status: "cancelled",
        displayStatus: "Dibatalkan",
        canCancel: false,
        canPay: false,
        canShip: false,
        canDeliver: false,
        canConfirmDelivery: false,
        isCompleted: false,
        isCancelled: true,
        isActive: false,
        needsCustomerAction: false,
      },
      cancellation_requested: {
        status: "cancellation_requested",
        displayStatus: "Permintaan Pembatalan",
        canCancel: false,
        canPay: false,
        canShip: false,
        canDeliver: false,
        canConfirmDelivery: false,
        isCompleted: false,
        isCancelled: false,
        isActive: true,
        needsCustomerAction: false,
      },
    };

    return statusMap[status] || statusMap.pending;
  }

  static calculateSimpleStatus(itemStatuses, paymentStatus) {
    if (paymentStatus === "pending") return "pending";

    const uniqueStatuses = [...new Set(itemStatuses)];

    // Single status - return as is
    if (uniqueStatuses.length === 1) {
      return uniqueStatuses[0];
    }

    // Mixed statuses - determine primary status
    if (itemStatuses.every(s => ["delivered", "received"].includes(s))) {
      return "delivered";
    }

    if (itemStatuses.some(s => s === "shipped")) {
      return "shipped";
    }

    if (itemStatuses.some(s => s === "packed")) {
      return "packed";
    }

    return "pending";
  }

  /**
   * Calculate available actions for order
   */
  static calculateOrderActions(order, itemStatuses) {
    const actions = {
      canCancel: false,
      canPay: false,
      canConfirmDelivery: false,
      canTrack: false,
    };

    // Can pay if pending
    if (order.paymentStatus === "pending") {
      actions.canPay = true;
      actions.canCancel = true;
      return actions;
    }

    // Can cancel if not yet shipped
    if (itemStatuses.every(s => ["pending", "packed"].includes(s))) {
      actions.canCancel = true;
    }

    // Can track if any item shipped
    if (itemStatuses.some(s => ["shipped", "delivered"].includes(s))) {
      actions.canTrack = true;
    }

    // Can confirm delivery if all delivered
    if (itemStatuses.every(s => s === "delivered")) {
      actions.canConfirmDelivery = true;
    }

    // Can review if received
    if (order.status === "received") {
      actions.canReview = true;
    }

    return actions;
  }

  static getSimpleStatusInfo(status) {
    const statusMap = {
      pending: {
        label: "Menunggu Pembayaran",
        color: "orange",
        icon: "clock",
      },
      packed: {
        label: "Sedang Dikemas",
        color: "blue",
        icon: "package",
      },
      shipped: {
        label: "Sedang Dikirim",
        color: "blue",
        icon: "truck",
      },
      delivered: {
        label: "Sudah Diterima",
        color: "green",
        icon: "check",
      },
      received: {
        label: "Selesai",
        color: "green",
        icon: "check",
      },
      cancelled: {
        label: "Dibatalkan",
        color: "red",
        icon: "x",
      },
      cancellation_requested: {
        label: "Permintaan Pembatalan",
        color: "yellow",
        icon: "alert",
      },
    };

    return statusMap[status] || statusMap.pending;
  }

  static shouldMergeOrder(order) {
    return order.paymentStatus === "pending";
  }
  /**
   * Format order list for CUSTOMER view - ENHANCED VERSION
   */
  static formatOrderListResponse(orders, options = {}) {
    return orders
      .map(order => {
        // ✅ MERGE untuk pending orders
        if (this.shouldMergeOrder(order)) {
          const allItems = order.cartSnapshot.items.map(item => {
            const itemStatus = order.itemStatuses?.find(is => is.product.toString() === item.product.toString());

            return {
              productName: item.productSnapshot.title,
              productImage: item.productSnapshot.image,
              quantity: item.quantity,
              price: item.priceAtPurchase * item.quantity,
              status: itemStatus?.status || "pending",
            };
          });

          // Filter by status jika ada
          let filteredItems = allItems;
          if (options.filterSellerStatus) {
            filteredItems = allItems.filter(item => options.filterSellerStatus.includes(item.status));

            if (filteredItems.length === 0) return null;
          }

          return {
            id: order._id.toString(),
            orderNumber: order.orderNumber,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            itemsCount: filteredItems.length,
            createdAt: order.createdAt,
            expiresAt: order.expiresAt,

            sellers: [
              {
                storeName: allItems[0].seller?.storeName || "Multiple Sellers",
                storeLogo: allItems[0].seller?.logo || allItems[0].seller?.storeLogo || null, // ✅ Ambil dari item pertama
                storeSlug: allItems[0].seller?.storeSlug || null,
                items: filteredItems,
              },
            ],

            statusInfo: this.getSimpleStatusInfo("pending"),

            actions: {
              canPay: true,
              canCancel: true,
              canConfirmDelivery: false,
              canTrack: false,
            },

            paymentInfo: {
              method: "ShopPay",
              status: order.paymentStatus,
            },
          };
        }

        // ✅ SPLIT untuk paid orders (existing logic tetap)
        const sellerGroups = {};

        order.cartSnapshot.items.forEach(item => {
          const seller = item.productSnapshot?.seller;
          const sellerId = seller?._id?.toString() || "unknown";

          if (!sellerGroups[sellerId]) {
            sellerGroups[sellerId] = {
              storeName: seller?.storeName || "Unknown Store",
              storeLogo: seller?.logo || seller?.storeLogo || seller?.sellerId?.logo || null, // ✅ Tambah fallback
              storeSlug: seller?.storeSlug || null,
              items: [],
            };
          }

          const itemStatus = order.itemStatuses?.find(is => is.product.toString() === item.product.toString());

          sellerGroups[sellerId].items.push({
            productName: item.productSnapshot.title,
            productImage: item.productSnapshot.image,
            quantity: item.quantity,
            price: item.priceAtPurchase * item.quantity,
            status: itemStatus?.status || order.status,
          });
        });

        const sellers = Object.values(sellerGroups);
        let filteredSellers = sellers;

        if (options.filterSellerStatus) {
          filteredSellers = sellers
            .filter(seller => seller.items.some(item => options.filterSellerStatus.includes(item.status)))
            .map(seller => ({
              ...seller,
              items: seller.items.filter(item => options.filterSellerStatus.includes(item.status)),
            }));

          if (filteredSellers.length === 0) return null;
        }

        const filteredItemStatuses = filteredSellers.flatMap(seller => seller.items.map(item => item.status));

        const allItemStatuses = order.itemStatuses?.map(is => is.status) || [order.status];
        const simpleStatus = this.calculateSimpleStatus(
          filteredItemStatuses.length > 0 ? filteredItemStatuses : allItemStatuses,
          order.paymentStatus
        );

        const actions = this.calculateOrderActions(
          order,
          filteredItemStatuses.length > 0 ? filteredItemStatuses : allItemStatuses
        );

        return {
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          itemsCount: order.totalItems,
          createdAt: order.createdAt,
          sellers: filteredSellers,
          statusInfo: this.getSimpleStatusInfo(simpleStatus),
          actions: actions,
          paymentInfo: {
            method: "ShopPay",
            status: order.paymentStatus,
            ...(order.paymentDetails?.paidAt && {
              paidAt: order.paymentDetails.paidAt,
            }),
          },
          ...(order.customerFeedback && {
            feedbackSummary: {
              canReview: order.status === "received" && !order.customerFeedback.rating,
              hasReviewed: !!(order.customerFeedback.rating || order.customerFeedback.review),
            },
          }),
        };
      })
      .filter(Boolean);
  }

  /**
   * ✅ NEW: Calculate real order status from parcels
   */
  static calculateOrderStatus(parcels) {
    if (!parcels || parcels.length === 0) return "pending";

    const statuses = parcels.map(p => p.status);

    // All delivered
    if (statuses.every(s => s === "delivered")) return "delivered";

    // Some delivered
    if (statuses.some(s => s === "delivered")) return "partially_delivered";

    // All shipped
    if (statuses.every(s => s === "shipped")) return "shipped";

    // Some shipped
    if (statuses.some(s => s === "shipped")) return "partially_shipped";

    // All packed
    if (statuses.every(s => s === "packed")) return "packed";

    // Mixed packed/pending
    if (statuses.some(s => s === "packed")) return "partially_packed";

    return "pending";
  }

  /**
   * ✅ NEW: Detailed status info with parcel context
   */
  static getDetailedStatusInfo(status, parcels) {
    const deliveredCount = parcels.filter(p => p.status === "delivered").length;
    const shippedCount = parcels.filter(p => p.status === "shipped").length;
    const packedCount = parcels.filter(p => p.status === "packed").length;
    const totalCount = parcels.length;

    const statusMap = {
      pending: {
        label: "Menunggu Pembayaran",
        color: "warning",
        icon: "clock",
        description: "Menunggu konfirmasi pembayaran",
      },
      paid: {
        label: "Dibayar - Menunggu Diproses",
        color: "info",
        icon: "check-circle",
        description: "Pembayaran berhasil, menunggu seller memproses",
      },
      packed: {
        label: "Dikemas",
        color: "info",
        icon: "package",
        description: "Pesanan sedang dikemas oleh seller",
      },
      partially_packed: {
        label: "Sebagian Dikemas",
        color: "info",
        icon: "package",
        description: `${packedCount}/${totalCount} paket sedang dikemas`,
      },
      shipped: {
        label: "Dikirim",
        color: "primary",
        icon: "truck",
        description: "Semua paket dalam pengiriman",
      },
      partially_shipped: {
        label: "Sebagian Dikirim",
        color: "primary",
        icon: "truck",
        description: `${shippedCount}/${totalCount} paket sudah dikirim`,
      },
      delivered: {
        label: "Diterima",
        color: "success",
        icon: "check-double",
        description: "Semua paket telah sampai",
      },
      partially_delivered: {
        label: "Sebagian Diterima",
        color: "success",
        icon: "check",
        description: `${deliveredCount}/${totalCount} paket sudah sampai`,
      },
      cancelled: {
        label: "Dibatalkan",
        color: "danger",
        icon: "x-circle",
        description: "Pesanan dibatalkan",
      },
    };

    return statusMap[status] || statusMap.pending;
  }

  /**
   * Format cart data for order creation
   */
  // Line 650-700 - REPLACE formatCartData method
  // Line ~680-710 - REPLACE formatCartData method
  static formatCartData(cart, totalAmount) {
    return {
      _id: cart._id,
      items: cart.items.map(item => {
        if (!item.product) {
          throw new Error("Cart item missing product data");
        }

        const seller = item.product.sellerId;
        let sellerData = null;

        if (seller) {
          if (typeof seller === "object" && seller !== null && seller._id) {
            // ✅ FIX: Explicitly map all seller fields including logo
            sellerData = {
              _id: seller._id,
              userId: seller.userId || null,
              storeName: seller.storeName || "Unknown Store",
              storeSlug: seller.storeSlug || null,
              logo: seller.logo || null, // ✅ Add logo field
            };
          } else {
            console.error(`Seller not populated for product ${item.product._id}`);
          }
        }

        return {
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
            sellerId: sellerData, // ✅ Contains logo now
          },
          quantity: item.quantity,
          priceAtAddition: item.priceAtAddition,
        };
      }),
      appliedCoupon: cart.appliedCoupon,
      totalItems: cart.totalItems,
      totalPrice: cart.calculateTotal(),
      finalPrice: totalAmount,
    };
  }

  /**
   * Format error response
   */
  static formatErrorResponse(message, statusCode = 400, data = null) {
    return {
      success: false,
      message,
      ...(data && { data }),
      statusCode,
    };
  }

  /**
   * Format success response
   */
  static formatSuccessResponse(message, data = null) {
    return {
      success: true,
      message,
      ...(data && { data }),
    };
  }

  /**
   * Format pagination response
   */
  static formatPaginationResponse(page, limit, total) {
    return {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    };
  }
}

module.exports = OrderResponseFormatter;
