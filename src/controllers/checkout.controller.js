// checkout.controller.js - REFACTORED TO CLASS-BASED VERSION
const Profile = require('../models/profile.model');
const Cart = require('../models/cart.model');
const asyncHandler = require('../middlewares/asyncHandler');

class CheckoutController {
  /**
   * GET / - Get checkout information (cart + user addresses)
   */
  static getCheckoutInfo = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    // Ambil cart dengan populate lengkap
    const cart = await Cart.findByUser(userId)
      .populate({
        path: 'items.product',
        populate: [
          {
            path: 'category',
            select: 'name description'
          },
          {
            path: 'sellerId',
            select: 'storeName storeSlug'
          }
        ]
      });

    if (!cart || !cart.items.length) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Ambil profile user dengan addresses
    const profile = await Profile.findByUser(userId);
    
    // Format response checkout
    const checkoutData = {
      cart: {
        _id: cart._id,
        items: cart.items,
        appliedCoupon: cart.appliedCoupon,
        totalItems: cart.totalItems,
        totalPrice: cart.calculateTotal(),
        finalPrice: cart.calculateFinalPrice(),
        discountAmount: cart.calculateTotal() - cart.calculateFinalPrice()
      },
      shippingAddresses: profile?.addresses || [],
      defaultAddress: profile?.defaultAddress || null,
      userInfo: {
        fullName: profile?.fullName || '',
        phone: profile?.phone || '',
        email: req.user.email // dari token
      }
    };

    res.json({
      success: true,
      message: 'Checkout information retrieved successfully',
      data: checkoutData
    });
  });

  /**
   * POST /preview - Preview order before creation
   */
  static previewOrder = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const {
      useProfileAddress = true,
      shippingAddress,
      selectedAddressIndex,
      paymentMethod
    } = req.body;

    // Ambil cart
    const cart = await Cart.findByUser(userId)
      .populate('items.product', 'title price');

    if (!cart || !cart.items.length) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Tentukan shipping address
    let finalShippingAddress = null;
    
    if (useProfileAddress) {
      const profile = await Profile.findByUser(userId);
      
      if (selectedAddressIndex !== undefined && profile?.addresses[selectedAddressIndex]) {
        finalShippingAddress = profile.addresses[selectedAddressIndex];
      } else {
        finalShippingAddress = profile?.defaultAddress;
      }
    } else if (shippingAddress) {
      finalShippingAddress = shippingAddress;
    }

    if (!finalShippingAddress) {
      return res.status(400).json({
        success: false,
        message: 'No shipping address available'
      });
    }

    // Hitung estimasi biaya pengiriman (dummy calculation)
    const shippingCost = CheckoutController.calculateShippingCost(finalShippingAddress, cart.items);
    
    // Preview order
    const orderPreview = {
      items: cart.items.map(item => ({
        product: {
          _id: item.product._id,
          title: item.product.title
        },
        quantity: item.quantity,
        price: item.priceAtAddition,
        subtotal: item.priceAtAddition * item.quantity
      })),
      shippingAddress: {
        ...finalShippingAddress,
        fullAddress: finalShippingAddress.fullAddress || 
          `${finalShippingAddress.street}, ${finalShippingAddress.city}, ${finalShippingAddress.state} ${finalShippingAddress.zipCode}, ${finalShippingAddress.country}`
      },
      paymentMethod,
      summary: {
        subtotal: cart.calculateTotal(),
        discount: cart.calculateTotal() - cart.calculateFinalPrice(),
        shippingCost,
        total: cart.calculateFinalPrice() + shippingCost
      }
    };

    res.json({
      success: true,
      data: orderPreview
    });
  });

  /**
   * Helper function untuk menghitung ongkir (dummy)
   */
  static calculateShippingCost(address, items) {
    // Implementasi sederhana - bisa diintegrasikan dengan API ongkir
    const baseShippingCost = 15000; // base cost
    const weightFactor = items.length * 2000; // asumsi per item = 2000
    const cityFactor = address.city?.toLowerCase().includes('jakarta') ? 0 : 5000;
    
    return baseShippingCost + weightFactor + cityFactor;
  }
}

module.exports = CheckoutController;