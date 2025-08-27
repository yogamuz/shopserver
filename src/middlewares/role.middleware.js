/**
 * Role-based access control middleware
 * Checks if user has required role(s) to access a resource
 */

const logger = require("../utils/logger");

const roleMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      // Check if user has required role
      const userRole = req.user.role;
      const userId = req.user._id || req.user.id; // FIX: Use _id from User object
      
      // Convert single role to array for consistency
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      
      // Admin has access to everything
      if (userRole === 'admin') {
        return next();
      }
      
      // Check if user's role is in allowed roles
      if (!roles.includes(userRole)) {
      logger.info(`🚫 Access denied: User ${userId} with role '${userRole}' tried to access resource requiring roles: ${roles.join(', ')}`);
        
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
          required: roles,
          current: userRole
        });
      }

      // Role is allowed, proceed
    logger.info(`✅ Access granted: User ${userId} with role '${userRole}'`);
      next();

    } catch (error) {
      logger.error("❌ Role middleware error:", error);
      res.status(500).json({
        success: false,
        message: "Role validation failed",
        error: error.message
      });
    }
  };
};

/**
 * Seller-specific middleware
 * Additional validation for seller role users
 */
const sellerMiddleware = async (req, res, next) => {
  try {
    // Must be called after authentication middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const userId = req.user._id || req.user.id; // FIX: Use _id from User object

    // Must be seller or admin
    if (!['seller', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Seller permissions required"
      });
    }

    // Skip additional validation for admin
    if (req.user.role === 'admin') {
      return next();
    }

    // For seller role, check if seller profile exists and is active
    const SellerProfile = require("../models/sellerProfile");
    const sellerProfile = await SellerProfile.findOne({ 
      userId: userId, // FIX: Use corrected userId
      deletedAt: null
    });

    if (!sellerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not found. Please create your seller profile first.",
        action: "create_seller_profile"
      });
    }

    if (sellerProfile.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: "Your seller account is inactive. Please contact support.",
        action: "contact_support"
      });
    }

    if (sellerProfile.status === 'archived') {
      return res.status(403).json({
        success: false,
        message: "Your seller account is archived. Please restore it to continue.",
        action: "restore_account"
      });
    }

    // Add seller profile to request for easy access
    req.sellerProfile = sellerProfile;
    
  logger.info(`✅ Seller validation passed: ${sellerProfile.storeName} (${sellerProfile.storeSlug})`);
    next();

  } catch (error) {
    logger.error("❌ Seller middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Seller validation failed",
      error: error.message
    });
  }
};

/**
 * Owner-specific middleware
 * Validates that the user can only access their own resources
 */
const ownerMiddleware = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const userId = req.user._id || req.user.id; // FIX: Use _id from User object

      // Admin can access all resources
      if (req.user.role === 'admin') {
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: `Resource ID parameter '${resourceIdParam}' is required`
        });
      }

      // Load the mongoose model
      const Model = require(`../models/${resourceModel}`);
      const resource = await Model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: "Resource not found"
        });
      }

      // Check ownership based on user role
      let isOwner = false;
      
      if (req.user.role === 'seller') {
        // For sellers, check if they own the resource through sellerId or userId
        if (resource.sellerId && resource.sellerId.toString() === req.sellerProfile?._id.toString()) {
          isOwner = true;
        } else if (resource.userId && resource.userId.toString() === userId.toString()) {
          isOwner = true;
        }
      } else if (req.user.role === 'user') {
        // For regular users, check userId
        if (resource.userId && resource.userId.toString() === userId.toString()) {
          isOwner = true;
        }
      }

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to access this resource"
        });
      }

      // Add resource to request for easy access
      req.resource = resource;
      next();

    } catch (error) {
      logger.error("❌ Owner middleware error:", error);
      res.status(500).json({
        success: false,
        message: "Ownership validation failed",
        error: error.message
      });
    }
  };
};

/**
 * Resource permission middleware
 * More granular permission checking for specific actions
 */
const resourcePermissionMiddleware = (permissions = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const userRole = req.user.role;
      const method = req.method.toLowerCase();
      
      // Check if user's role has permission for this action
      const rolePermissions = permissions[userRole] || [];
      const hasPermission = rolePermissions.includes('*') || rolePermissions.includes(method);

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `${userRole} role doesn't have permission to ${method} this resource`,
          allowedActions: rolePermissions
        });
      }

      next();

    } catch (error) {
      logger.error("❌ Resource permission middleware error:", error);
      res.status(500).json({
        success: false,
        message: "Permission validation failed",
        error: error.message
      });
    }
  };
};

module.exports = {
  roleMiddleware,
  sellerMiddleware,
  ownerMiddleware,
  resourcePermissionMiddleware
};