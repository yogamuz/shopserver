// ========================================
// FILE: src/services/sellerService.js
// ========================================
const { MESSAGES } = require('../constants/httpStatus');
const logger = require('../utils/logger');
class SellerService {
  static async getSellerProfile(userId) {
    const SellerProfile = require("../models/seller-profile.model");
    return await SellerProfile.findOne({ 
      userId,
      deletedAt: null
    }).select('storeName storeSlug status');
  }

  static validateSellerForLogin(sellerProfile, username) {
    if (!sellerProfile) {
      logger.info(`⚠️ Seller ${username} logging in without seller profile`);
      return { isValid: true, allowLogin: true };
    }
    
    if (sellerProfile.status === 'inactive') {
      return { 
        isValid: false, 
        allowLogin: false, 
        message: MESSAGES.AUTH.SELLER_ACCOUNT_INACTIVE 
      };
    }
    
    if (sellerProfile.status === 'archived') {
      logger.info(`⚠️ Seller ${username} logging in with archived profile`);
    }
    
    return { isValid: true, allowLogin: true };
  }

  static validateSellerForRefresh(sellerProfile) {
    if (sellerProfile && sellerProfile.status === 'inactive') {
      logger.info("⚠️ Refreshing token for inactive seller profile");
    }
    return true; // Always allow refresh but log warnings
  }
}

module.exports = SellerService;
