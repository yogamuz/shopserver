// order-status.service.js
class OrderStatusService {
  /**
   * Get display status mapping for orders
   */
  static getDisplayStatus(status) {
    const statusMap = {
      pending: "Menunggu Pembayaran",
      packed: "Dikemas",
      confirmed: "Dikonfirmasi",
      processing: "Diproses",
      shipped: "Dikirim",
      delivered: "Terkirim",
      received: "Diterima",
      cancelled: "Dibatalkan",
      refunded: "Dikembalikan",
    };

    return statusMap[status] || status;
  }

  /**
   * Get status with additional information
   */
  static getStatusInfo(status) {
    return {
      status: status,
      displayStatus: this.getDisplayStatus(status),
      canCancel: ["pending", "packed"].includes(status),
      canPay: status === "pending",
      canShip: status === "packed",
      canDeliver: status === "shipped",
      canConfirmDelivery: status === "delivered",
      isCompleted: status === "received",
      isCancelled: ["cancelled", "refunded"].includes(status),
      isActive: !["cancelled", "refunded", "received"].includes(status),
      needsCustomerAction: status === "delivered",
    };
  }

  /**
   * Get next possible statuses for current status
   */
  static getNextPossibleStatuses(currentStatus) {
    const statusFlow = {
      pending: ["packed", "cancelled"],
      packed: ["confirmed", "processing", "cancelled"],
      confirmed: ["processing", "shipped"],
      processing: ["shipped"],
      shipped: ["delivered"],
      delivered: ["received"],
      received: [], // Final status
      cancelled: [], // Final status
      refunded: [], // Final status
    };

    return statusFlow[currentStatus] || [];
  }

  /**
   * Validate status transition
   */
  static canTransitionTo(currentStatus, newStatus) {
    const allowedStatuses = this.getNextPossibleStatuses(currentStatus);
    return allowedStatuses.includes(newStatus);
  }

  /**
   * Get status color for UI
   */
  static getStatusColor(status) {
    const colorMap = {
      pending: "orange",
      packed: "blue",
      confirmed: "cyan",
      processing: "purple",
      shipped: "indigo",
      delivered: "yellow",
      received: "green",
      cancelled: "red",
      refunded: "gray",
    };

    return colorMap[status] || "gray";
  }

  /**
   * Get status icon for UI
   */
  static getStatusIcon(status) {
    const iconMap = {
      pending: "clock",
      packed: "package",
      confirmed: "check-circle",
      processing: "cog",
      shipped: "truck",
      delivered: "home",
      received: "check-circle-2",
      cancelled: "x-circle",
      refunded: "rotate-ccw",
    };

    return iconMap[status] || "circle";
  }

  /**
   * Check if status requires customer action
   */
  static requiresCustomerAction(status) {
    return ["pending", "delivered"].includes(status);
  }

  /**
   * Check if status requires seller action
   */
  static requiresSellerAction(status) {
    return ["packed", "confirmed", "processing"].includes(status);
  }

  /**
   * Get estimated time for status completion
   */
  static getEstimatedTime(status) {
    const timeMap = {
      pending: "24 hours", // Customer should pay within 24 hours
      packed: "1-2 days", // Seller should pack within 1-2 days
      confirmed: "1 day", // Seller should confirm within 1 day
      processing: "1-3 days", // Processing time
      shipped: "3-7 days", // Shipping time
      delivered: "Immediate", // Delivered immediately when marked
      received: "Final", // Final status
      cancelled: "Final", // Final status
      refunded: "Final", // Final status
    };

    return timeMap[status] || "Unknown";
  }

  /**
   * Get status description for customer
   */
  static getCustomerDescription(status) {
    const descriptions = {
      pending: "Silakan lakukan pembayaran untuk melanjutkan pesanan Anda.",
      packed: "Pesanan Anda sedang dikemas oleh penjual.",
      confirmed: "Pesanan Anda telah dikonfirmasi oleh penjual.",
      processing: "Pesanan Anda sedang diproses.",
      shipped: "Pesanan Anda sedang dalam perjalanan.",
      delivered: "Pesanan Anda telah sampai. Silakan konfirmasi penerimaan.",
      received: "Pesanan telah selesai. Terima kasih atas pembelian Anda.",
      cancelled: "Pesanan telah dibatalkan.",
      refunded: "Dana telah dikembalikan ke ShopPay Anda.",
    };

    return descriptions[status] || "Status tidak diketahui.";
  }

  /**
   * Get status description for seller
   */
  static getSellerDescription(status) {
    const descriptions = {
      pending: "Menunggu pembayaran dari pembeli.",
      packed: "Silakan kemas pesanan dan siapkan untuk pengiriman.",
      confirmed: "Silakan proses pesanan untuk pengiriman.",
      processing: "Pesanan sedang diproses untuk pengiriman.",
      shipped: "Pesanan dalam perjalanan ke pembeli.",
      delivered: "Pesanan telah sampai, menunggu konfirmasi pembeli.",
      received: "Pesanan selesai. Pembayaran telah dikonfirmasi.",
      cancelled: "Pesanan dibatalkan.",
      refunded: "Pesanan dibatalkan dan dana dikembalikan.",
    };

    return descriptions[status] || "Status tidak diketahui.";
  }

  /**
   * Get all available statuses with info
   */
  static getAllStatusesInfo() {
    const statuses = [
      "pending", "packed", "confirmed", "processing", 
      "shipped", "delivered", "received", "cancelled", "refunded"
    ];

    return statuses.map(status => ({
      status,
      displayStatus: this.getDisplayStatus(status),
      color: this.getStatusColor(status),
      icon: this.getStatusIcon(status),
      estimatedTime: this.getEstimatedTime(status),
      customerDescription: this.getCustomerDescription(status),
      sellerDescription: this.getSellerDescription(status),
      ...this.getStatusInfo(status)
    }));
  }
}

module.exports = OrderStatusService;