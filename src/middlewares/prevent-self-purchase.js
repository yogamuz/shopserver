// middleware/prevent-self-purchase.js
const Product = require('../models/products.model')
const SellerProfile = require('../models/seller-profile.model')
const ResponseHelper = require ('../utils/response.helper')

const asyncHandler = require ('./asyncHandler')
const preventSelfPurchase = asyncHandler(async (req, res, next) => {
  // Get productId from either body (POST) or params (PUT)
  const productId = req.body.productId || req.params.productId;
  
  if (!productId) {
    return ResponseHelper.badRequest(res, "Product ID is required");
  }
  
  const product = await Product.findById(productId);
  
  if (!product) {
    return ResponseHelper.badRequest(res, "Product not found");
  }
  
  const userSellerProfile = await SellerProfile.findOne({ userId: req.user._id });
  
  if (userSellerProfile && product.sellerId.equals(userSellerProfile._id)) {
    return ResponseHelper.badRequest(res, "Cannot purchase your own products");
  }
  
  next();
});

module.exports = preventSelfPurchase