// inventory.service.js
const Product = require("../../models/products.model");

class InventoryService {
  /**
   * Validate stock for cart items
   */ 1
  static async validateStock(cartItems) {
    for (const item of cartItems) {
      if (item.product.stock < item.quantity) {
        const error = new Error(
          `Insufficient stock for ${item.product.title}. Available: ${item.product.stock}, Requested: ${item.quantity}`
        );
        error.statusCode = 400;
        throw error;
      }
    }
  }

  /**
   * Update product stock (for purchase/cancellation)
   * @param {Array} orderItems - Order items from cartSnapshot
   * @param {Number} multiplier - 1 for purchase, -1 for cancellation/restore
   */ 2
  static async updateProductStock(orderItems, multiplier = -1) {
    const updatePromises = orderItems.map((item) => {
      return Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity * multiplier } }
      );
    });

    await Promise.all(updatePromises);
  }

  /**
   * Restore product stock after cancellation
   */ 3
  static async restoreProductStock(orderItems) {
    await this.updateProductStock(orderItems, 1);
  }

  /**
   * Validate stock before order processing (comprehensive check)
   */ 4
  static async validateStockForOrder(cartItems) {
    const stockIssues = [];

    for (const item of cartItems) {
      const product = await Product.findById(item.product._id);

      if (!product) {
        stockIssues.push({
          productId: item.product._id,
          title: item.product ? item.product.title : "Unknown Product",
          issue: "PRODUCT_NOT_FOUND",
          message: "Product no longer exists",
        });
        continue;
      }

      if (!product.isActive) {
        stockIssues.push({
          productId: item.product._id,
          title: product.title,
          issue: "PRODUCT_INACTIVE",
          message: "Product is no longer available",
        });
        continue;
      }

      if (product.deletedAt) {
        stockIssues.push({
          productId: item.product._id,
          title: product.title,
          issue: "PRODUCT_DELETED",
          message: "Product has been removed",
        });
        continue;
      }

      if (product.stock < item.quantity) {
        stockIssues.push({
          productId: item.product._id,
          title: product.title,
          issue: "INSUFFICIENT_STOCK",
          message: `Not enough stock. Available: ${product.stock}, Requested: ${item.quantity}`,
          availableStock: product.stock,
          requestedQuantity: item.quantity,
        });
      }
    }

    return {
      isValid: stockIssues.length === 0,
      issues: stockIssues,
      hasStockIssues: stockIssues.some(
        (issue) => issue.issue === "INSUFFICIENT_STOCK"
      ),
      hasAvailabilityIssues: stockIssues.some((issue) =>
        ["PRODUCT_NOT_FOUND", "PRODUCT_INACTIVE", "PRODUCT_DELETED"].includes(
          issue.issue
        )
      ),
    };
  }



}

module.exports = InventoryService;
