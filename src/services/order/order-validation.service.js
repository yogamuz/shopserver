  // order-validation.service.js
  const Cart = require("../../models/cart.model");

  class OrderValidationService {
    /**
     * Validate order creation data
     */
    static async validateOrderCreation(userId, { paymentMethod, address_id }) {
      // Validate payment method
      if (!paymentMethod) {
        return {
          isValid: false,
          message: "Payment method is required",
        };
      }

      if (paymentMethod !== "shop_pay") {
        return {
          isValid: false,
          message: "Only ShopPay payment method is supported",
        };
      }

      // Parallel validation of address and cart to reduce latency
      const [addressValidation, cartValidation] = await Promise.all([
        this.validateUserAddress(userId, address_id),
        this.validateUserCart(userId),
      ]);

      if (!addressValidation.isValid) {
        return addressValidation;
      }

      if (!cartValidation.isValid) {
        return cartValidation;
      }

      return {
        isValid: true,
        data: {
          shippingAddress: addressValidation.data.shippingAddress,
          cart: cartValidation.data.cart,
        },
      };
    }

    /**
     * Validate user address
     */
    static async validateUserAddress(userId, address_id) {
      const Profile = require("../../models/profile.model");

      // Use lean() to get plain JavaScript objects instead of Mongoose documents
      // and select only necessary fields to reduce memory usage
      const userProfile = await Profile.findByUser(userId).select("addresses defaultAddress").lean();

      if (!userProfile) {
        return {
          isValid: false,
          message: "User profile not found. Please complete your profile first.",
        };
      }

      let shippingAddress;

      if (address_id !== undefined) {
        const addressIndex = parseInt(address_id);
        if (isNaN(addressIndex) || addressIndex < 0 || addressIndex >= userProfile.addresses.length) {
          return {
            isValid: false,
            message: "Invalid address index",
          };
        }
        shippingAddress = userProfile.addresses[addressIndex];
      } else {
        if (!userProfile.defaultAddress) {
          return {
            isValid: false,
            message: "No default address found. Please add an address in your profile first.",
          };
        }
        shippingAddress = userProfile.defaultAddress;
      }

      // Validate address completeness
      if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode) {
        return {
          isValid: false,
          message: "Incomplete address information. Please update your address in profile.",
        };
      }

      return {
        isValid: true,
        data: {
          shippingAddress,
        },
      };
    }

  // Line 107-145 - REPLACE validateUserCart
  // Line 107-145 - REPLACE validateUserCart method
  static async validateUserCart(userId) {
    const cart = await Cart.findByUser(userId)
      .populate({
        path: "items.product",
        select: "title price stock isActive description image slug category sellerId",
        populate: [
          {
            path: "category",
            select: "_id name description slug",
          },
          {
            path: "sellerId",
            select: "_id userId storeName storeSlug logo",
            model: "SellerProfile"
          },
        ],
      });

    if (!cart || !cart.items.length) {
      return {
        isValid: false,
        message: "Cart is empty"
      };
    }

    // ✅ Validate all items have proper data
    const invalidItems = [];
    
    for (const item of cart.items) {
      if (!item.product) {
        invalidItems.push({ reason: "Product not found" });
        continue;
      }

      if (!item.product.category || !item.product.category._id) {
        invalidItems.push({
          reason: "Product missing category",
          productId: item.product._id,
          productName: item.product.title
        });
      }

      if (!item.product.sellerId || !item.product.sellerId._id) {
        invalidItems.push({
          reason: "Product missing seller",
          productId: item.product._id,
          productName: item.product.title
        });
      }
    }

    if (invalidItems.length > 0) {
      return {
        isValid: false,
        message: "Some products have invalid data. Please remove them from cart.",
        data: { invalidItems }
      };
    }

    return {
      isValid: true,
      data: { cart }
    };
  }

    /**
     * Validate order exists and belongs to user
     */
    static async validateOrderAccess(orderId, userId) {
      const Order = require("../../models/order.model");

      // Use lean() and select only necessary fields for validation
      const order = await Order.findOne({
        _id: orderId,
        user: userId,
      })
        .select("_id user status timestamps paymentStatus") // Only select fields needed for validation
        .lean();

      if (!order) {
        return {
          isValid: false,
          message: "Order not found",
          statusCode: 404,
        };
      }

      return {
        isValid: true,
        data: {
          order,
        },
      };
    }

    /**
     * Validate order can be cancelled
     */
    static validateOrderCancellation(order) {
      if (!["pending", "packed"].includes(order.status)) {
        return {
          isValid: false,
          message: "Order cannot be cancelled at this stage",
          statusCode: 400,
        };
      }

      return {
        isValid: true,
      };
    }

    /**
     * Validate order can be confirmed for delivery
     */
    static validateDeliveryConfirmation(order) {
      if (order.status !== "delivered") {
        return {
          isValid: false,
          message: "Order cannot be confirmed. It must be delivered first.",
          statusCode: 400,
        };
      }

      if (order.timestamps.receivedAt) {
        return {
          isValid: false,
          message: "Order has already been confirmed as received",
          statusCode: 400,
          alreadyConfirmed: true,
        };
      }

      return {
        isValid: true,
      };
    }
  }

  module.exports = OrderValidationService;
