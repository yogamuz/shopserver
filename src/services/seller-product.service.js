const Product = require("../models/products.model");
const SellerProfile = require("../models/seller-profile.model");
const Category = require("../models/category.model");
const mongoose = require("mongoose");
const imageUploader = require("../utils/image-uploader.util");

class SellerProductService {

    /**
   * Generate default image object with alt text
   * @param {string} title - Product title for alt text
   * @param {string|null} imageUrl - Image URL if exists
   * @returns {Object} Image object with alt text
   */
  generateImageWithAlt(title, imageUrl = null) {
    return {
      url: imageUrl,
      alt: title || 'Product Image',
      hasImage: !!imageUrl,
      // Optional: Add placeholder image URL
      placeholder: imageUrl ? null : '/images/placeholder-product.png'
    };
  }
  /**
   * Validate category exists and is active
   * @param {string} categoryId - Category ID
   * @returns {Promise<Object|null>} Category object or null
   */
  async validateCategory(categoryId) {
    const category = await Category.findById(categoryId);
    return (category && category.isActive) ? category : null;
  }

  /**
   * Create new product for seller
   * @param {string} sellerId - Seller profile ID
   * @param {Object} productData - Product data
   * @returns {Promise<Object>} Created product
   */
async createProduct(sellerId, productData) {
    const { title, description, price, category, stock, image } = productData;

    // Create product with seller reference
    const product = new Product({
      title,
      description,
      price,
      category,
      image: image || null, // Allow null images
      stock,
      sellerId
    });

    await product.save();
    await product.populate(['category', 'sellerId']);

    // Transform response to include imageWithAlt
    const productResponse = product.toObject();
    productResponse.imageWithAlt = this.generateImageWithAlt(product.title, product.image);

    return productResponse;
  }

  /**
   * Get seller's products with filtering and pagination
   * @param {string} sellerId - Seller profile ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Products with pagination
   */
   async getSellerProducts(sellerId, options = {}) {
    const { 
      page = 1, 
      limit = 12, 
      sortBy = 'createdAt', 
      sortOrder = -1,
      status = 'all',
      category,
      search
    } = options;

    // Build match criteria
    const match = { sellerId };

    if (status !== 'all') {
      if (status === 'active') {
        match.isActive = true;
      } else if (status === 'inactive') {
        match.isActive = false;
      }
    }

    if (category) {
      match.category = mongoose.Types.ObjectId(category);
    }

    if (search) {
      match.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Get products with pagination
    const products = await Product.find(match)
      .sort({ [sortBy]: parseInt(sortOrder) })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('category')
      .populate('sellerId', 'storeName storeSlug');

    // Transform products to include imageWithAlt
    const transformedProducts = products.map(product => {
      const productObj = product.toObject();
      productObj.imageWithAlt = this.generateImageWithAlt(product.title, product.image);
      return productObj;
    });

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(match);

    return {
      products: transformedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / parseInt(limit)),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit)
      }
    };
  }

  /**
   * Get single product for seller
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @returns {Promise<Object|null>} Product or null
   */
 async getSellerProduct(productId, sellerId) {
    const product = await Product.findOne({
      _id: productId,
      sellerId
    })
    .populate('category')
    .populate('sellerId', 'storeName storeSlug');

    if (!product) return null;

    // Transform to include imageWithAlt
    const productObj = product.toObject();
    productObj.imageWithAlt = this.generateImageWithAlt(product.title, product.image);
    
    return productObj;
  }

  /**
   * Update product
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object|null>} Updated product or null
   */
  async updateProduct(productId, sellerId, updates) {
    const product = await Product.findOne({
      _id: productId,
      sellerId
    });

    if (!product) {
      return null;
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (key !== 'sellerId' && key !== '_id') {
        product[key] = updates[key];
      }
    });

    await product.save();
    await product.populate(['category', 'sellerId']);

    return product;
  }

  /**
   * Update product status
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object|null>} Updated product or null
   */
  async updateProductStatus(productId, sellerId, isActive) {
    return await Product.findOneAndUpdate(
      {
        _id: productId,
        sellerId
      },
      { isActive: Boolean(isActive) },
      { new: true }
    )
    .populate(['category', 'sellerId']);
  }

  /**
   * Delete product
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @returns {Promise<Object|null>} Deleted product or null
   */
  async deleteProduct(productId, sellerId) {
    const product = await Product.findOneAndDelete({
      _id: productId,
      sellerId
    });

    if (product && product.image) {
      await imageUploader.deleteImage(product.image);
    }

    return product;
  }

  /**
   * Bulk update product status
   * @param {Array} productIds - Array of product IDs
   * @param {string} sellerId - Seller profile ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object>} Update result
   */
  async bulkUpdateProductStatus(productIds, sellerId, isActive) {
    return await Product.updateMany(
      {
        _id: { $in: productIds },
        sellerId
      },
      { isActive: Boolean(isActive) }
    );
  }

  /**
   * Bulk delete products
   * @param {Array} productIds - Array of product IDs
   * @param {string} sellerId - Seller profile ID
   * @returns {Promise<Object>} Delete result
   */
  async bulkDeleteProducts(productIds, sellerId) {
    // Get products to delete (for image cleanup)
    const productsToDelete = await Product.find({
      _id: { $in: productIds },
      sellerId
    });

    // Delete products
    const result = await Product.deleteMany({
      _id: { $in: productIds },
      sellerId
    });

    // Delete associated images
    for (const product of productsToDelete) {
      if (product.image) {
        await imageUploader.deleteImage(product.image);
      }
    }

    return result;
  }

  /**
   * Upload product image
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @param {Object} file - Uploaded file
   * @returns {Promise<Object>} Upload result
   */
  async uploadProductImage(productId, sellerId, file) {
    const product = await Product.findOne({
      _id: productId,
      sellerId
    });

    if (!product) {
      return { success: false, message: "Product not found" };
    }

    // Upload new image
    const uploadResult = await imageUploader.uploadImage(file, {
      folder: `products/${productId}`,
      maxSize: 3 * 1024 * 1024, // 3MB
      dimensions: { width: 800, height: 600 }
    });

    if (!uploadResult.success) {
      return uploadResult;
    }

    // Delete old image if exists
    if (product.image) {
      await imageUploader.deleteImage(product.image);
    }

    // Update product with new image URL
    product.image = uploadResult.imageUrl;
    await product.save();

    return {
      success: true,
      imageUrl: uploadResult.imageUrl,
      metadata: uploadResult.metadata,
      productTitle: product.title
    };
  }

  /**
   * Get dashboard stats for seller
   * @param {string} sellerId - Seller profile ID
   * @returns {Promise<Object>} Dashboard statistics
   */
  async getDashboardStats(sellerId) {
    // Get product stats
    const [
      totalProducts,
      activeProducts,
      inactiveProducts,
      outOfStockProducts,
      lowStockProducts
    ] = await Promise.all([
      Product.countDocuments({ sellerId }),
      Product.countDocuments({ sellerId, isActive: true }),
      Product.countDocuments({ sellerId, isActive: false }),
      Product.countDocuments({ sellerId, stock: 0 }),
      Product.countDocuments({ sellerId, stock: { $lte: 10, $gt: 0 } })
    ]);

    // Get recent products
    const recentProducts = await Product.find({ sellerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('category', 'name');

    // Get top products by rating
    const topProducts = await Product.find({ 
      sellerId,
      isActive: true,
      rating: { $gt: 0 }
    })
    .sort({ rating: -1, reviews: -1 })
    .limit(5)
    .populate('category', 'name');

    // Calculate average rating
    const ratingStats = await Product.aggregate([
      { $match: { sellerId, rating: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: "$reviews" }
        }
      }
    ]);

    return {
      products: {
        total: totalProducts,
        active: activeProducts,
        inactive: inactiveProducts,
        outOfStock: outOfStockProducts,
        lowStock: lowStockProducts
      },
      performance: {
        averageRating: ratingStats[0]?.averageRating || 0,
        totalReviews: ratingStats[0]?.totalReviews || 0
      },
      recent: {
        products: recentProducts
      },
      top: {
        products: topProducts
      }
    };
  }

  /**
   * Get product statistics for seller
   * @param {string} sellerId - Seller profile ID
   * @param {string} period - Time period for stats
   * @returns {Promise<Object>} Product statistics
   */
  async getProductStats(sellerId, period = '30d') {
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get products created in period
    const productsInPeriod = await Product.find({
      sellerId,
      createdAt: { $gte: startDate }
    });

    // Group by category
    const categoryStats = await Product.aggregate([
      { $match: { sellerId } },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: '$category',
          categoryName: { $first: '$categoryInfo.name' },
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          averagePrice: { $avg: '$price' },
          totalStock: { $sum: '$stock' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Price range analysis
    const priceStats = await Product.aggregate([
      { $match: { sellerId } },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          averagePrice: { $avg: '$price' },
          totalValue: { $sum: { $multiply: ['$price', '$stock'] } }
        }
      }
    ]);

    // Monthly trend (last 12 months)
    const monthlyTrend = await Product.aggregate([
      { 
        $match: { 
          sellerId,
          createdAt: { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return {
      period,
      dateRange: { startDate, endDate: now },
      productsInPeriod: productsInPeriod.length,
      categories: categoryStats,
      pricing: priceStats[0] || {
        minPrice: 0,
        maxPrice: 0,
        averagePrice: 0,
        totalValue: 0
      },
      trends: {
        monthly: monthlyTrend
      }
    };
  }

  /**
   * Get store products (public)
   * @param {string} sellerId - Seller profile ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Store products with pagination
   */
 async getStoreProducts(sellerId, options = {}) {
    const { 
      page = 1, 
      limit = 12, 
      sortBy = 'createdAt', 
      sortOrder = -1,
      category,
      minPrice,
      maxPrice,
      search
    } = options;

    // Build match criteria
    const match = { 
      sellerId,
      isActive: true
    };

    if (category) {
      match.category = mongoose.Types.ObjectId(category);
    }

    if (minPrice !== undefined) {
      match.price = { $gte: parseFloat(minPrice) };
    }

    if (maxPrice !== undefined) {
      match.price = { ...match.price, $lte: parseFloat(maxPrice) };
    }

    if (search) {
      match.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Get products with pagination
    const products = await Product.find(match)
      .sort({ [sortBy]: parseInt(sortOrder) })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('category');

    // Transform products to include imageWithAlt
    const transformedProducts = products.map(product => {
      const productObj = product.toObject();
      productObj.imageWithAlt = this.generateImageWithAlt(product.title, product.image);
      return productObj;
    });

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(match);

    return {
      products: transformedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / parseInt(limit)),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit)
      }
    };
  }
}

module.exports = new SellerProductService();