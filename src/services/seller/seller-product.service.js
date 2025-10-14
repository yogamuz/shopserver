// seller-product.service.js - REFACTORED TO CLASS-BASED VERSION
const Product = require("../../models/products.model");
const Category = require("../../models/category.model");
const mongoose = require("mongoose");
const SellerProfileService = require("./seller-profile.service");
const imageUploader = require("../../utils/cloudinary-uploader.util");
const logger = require("../../utils/logger");

class SellerProductService {
  /**
  /**
   * Generate image with alt text
   * @param {string} title - Product title
   * @param {string} image - Image URL
   * @returns {Object} Image object with alt text
   */
  static generateImageWithAlt(title, image) {
    return {
      url: image || null,
      alt: title,
      hasImage: !!image,
    };
  }

  /**
   * Validate category exists and is active
   * @param {string} categoryId - Category ID
   * @returns {Promise<Object|null>} Category object or null
   */
  static async validateCategory(categoryId) {
    const category = await Category.findById(categoryId);
    return category && category.isActive ? category : null;
  }

  /**
   * Create product for seller
   * @param {string} sellerId - Seller profile ID
   * @param {Object} productData - Product data
   * @returns {Promise<Object>} Clean product object
   */
  static async createProduct(sellerId, productData) {
    const { title, description, price, category, stock, image } = productData;

    // Create product with seller reference
    const product = new Product({
      title,
      description,
      price,
      category,
      image: image || null,
      stock,
      sellerId, // Keep as sellerId in database
    });

    await product.save();
    await product.populate([
      { path: "category", select: "name description" },
      { path: "sellerId", select: "storeName storeSlug logo" },
    ]);

    // Transform to clean response format
    return SellerProductService.transformProduct(product);
  }

  /**
   * Get seller's products with filtering and pagination
   * @param {string} sellerId - Seller profile ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Products with pagination
   */
  static async getSellerProducts(sellerId, options = {}) {
    const {
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortOrder = "desc",
      status = "all",
      category,
      search,
      minPrice,
      maxPrice,
      inStock,
    } = options;

    // Validate sellerId
    if (!mongoose.isValidObjectId(sellerId)) {
      throw new Error("Invalid seller ID format");
    }

    // Build match criteria
    const match = { sellerId: sellerId };

    // Apply filters
    if (status !== "all") {
      match.isActive = status === "active";
    }

    // FIXED: Handle category filter - support both ObjectId and name
    if (category) {
      if (mongoose.isValidObjectId(category)) {
        // If it's a valid ObjectId, use directly
        match.category = category;
      } else {
        // If it's a string name, look up the category ObjectId
        const categoryDoc = await Category.findOne({
          name: new RegExp(`^${category}$`, "i"), // Case insensitive exact match
          isActive: true,
        });
        if (categoryDoc) {
          match.category = categoryDoc._id;
        } else {
          // If category name not found, return empty results
          return {
            products: [],
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: parseInt(limit),
              hasNext: false,
              hasPrev: false,
            },
          };
        }
      }
    }

    if (minPrice !== undefined) {
      match.price = { $gte: parseFloat(minPrice) };
    }
    if (maxPrice !== undefined) {
      match.price = { ...match.price, $lte: parseFloat(maxPrice) };
    }

    if (inStock === "true") {
      match.stock = { $gt: 0 };
    } else if (inStock === "false") {
      match.stock = { $eq: 0 };
    }

    if (search) {
      match.$or = [{ title: new RegExp(search, "i") }, { description: new RegExp(search, "i") }];
    }

    // Sort direction
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Get products with pagination
    const products = await Product.find(match)
      .sort({ [sortBy]: sortDirection })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("category", "name description")
      .populate("sellerId", "storeName storeSlug logo")
      .lean();

    // Transform products to clean format
    const transformedProducts = products.map(product => SellerProductService.transformProduct(product));

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(match);

    return {
      products: transformedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / parseInt(limit)),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < Math.ceil(totalProducts / parseInt(limit)),
        hasPrev: parseInt(page) > 1,
      },
    };
  }

  /**
   * Get single product by seller
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @returns {Promise<Object>} Clean product data
   */
  static async getSellerProduct(productId, sellerId) {
    // Validate IDs
    if (!mongoose.isValidObjectId(productId)) {
      throw new Error("Invalid product ID format");
    }
    if (!mongoose.isValidObjectId(sellerId)) {
      throw new Error("Invalid seller ID format");
    }

    const product = await Product.findOne({
      _id: productId,
      sellerId,
    })
      .populate("category", "name description")
      .populate("sellerId", "storeName storeSlug logo")
      .lean();

    if (!product) return null;

    return SellerProductService.transformProduct(product);
  }

  /**
   * Transform product to clean response format
   * @param {Object} product - Product document
   * @returns {Object} Clean product object
   */
  static transformProduct(product) {
    // Handle both Mongoose document and lean object
    const productObj = product.toObject ? product.toObject() : product;

    return {
      id: productObj._id.toString(),
      title: productObj.title,
      description: productObj.description,
      price: productObj.price,
      priceFormatted: `Rp ${productObj.price.toLocaleString("id-ID")}`,
      image: productObj.image || null,
      category: productObj.category?.name || null,
      stock: productObj.stock,
      rating: productObj.rating || 0,
      reviews: productObj.reviews || 0,
      isActive: productObj.isActive,
      createdAt: productObj.createdAt,
    };
  }

  /**
   * Update product
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object|null>} Updated product or null
   */
  static async updateProduct(productId, sellerId, updates) {
    const product = await Product.findOne({
      _id: productId,
      sellerId,
    });

    if (!product) {
      return null;
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (key !== "sellerId" && key !== "_id") {
        product[key] = updates[key];
      }
    });

    await product.save();
    await product.populate([
      { path: "category", select: "name description" },
      { path: "sellerId", select: "storeName storeSlug" }, // FIXED: Removed logo and contact
    ]);

    // FIXED: Transform to clean response format using existing transformProduct method
    return SellerProductService.transformProduct(product);
  }

  /**
   * Update product status
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object|null>} Updated product or null
   */
  static async updateProductStatus(productId, sellerId, isActive) {
    const product = await Product.findOneAndUpdate(
      {
        _id: productId,
        sellerId,
      },
      { isActive: Boolean(isActive) },
      { new: true }
    ).populate([
      { path: "category", select: "name description" },
      { path: "sellerId", select: "storeName storeSlug" }, // FIXED: Removed logo and contact
    ]);

    if (!product) return null;

    // FIXED: Transform to clean response format using existing transformProduct method
    return SellerProductService.transformProduct(product);
  }

  /**
   * Delete product
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @returns {Promise<Object|null>} Deleted product or null
   */
  static async deleteProduct(productId, sellerId) {
    const product = await Product.findOneAndDelete({
      _id: productId,
      sellerId,
    });

    // Delete image from Cloudinary if exists
    if (product && product.image) {
      const deleteResult = await imageUploader.deleteImage(product.image);
      if (deleteResult.success) {
        logger.info(`✅ Product image deleted from Cloudinary: ${product.title}`);
      } else {
        logger.warn(`⚠️ Failed to delete image from Cloudinary: ${deleteResult.message}`);
      }
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
  static async bulkUpdateProductStatus(productIds, sellerId, isActive) {
    return await Product.updateMany(
      {
        _id: { $in: productIds },
        sellerId,
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
  static async bulkDeleteProducts(productIds, sellerId) {
    // Get products to delete (for image cleanup)
    const productsToDelete = await Product.find({
      _id: { $in: productIds },
      sellerId,
    });

    // Delete products
    const result = await Product.deleteMany({
      _id: { $in: productIds },
      sellerId,
    });

    // Delete associated images from Cloudinary
    const imageDeletePromises = productsToDelete
      .filter(product => product.image)
      .map(async product => {
        try {
          const deleteResult = await imageUploader.deleteImage(product.image);
          if (deleteResult.success) {
            logger.info(`✅ Deleted Cloudinary image for product: ${product.title}`);
          } else {
            logger.warn(`⚠️ Failed to delete Cloudinary image for product: ${product.title}`);
          }
          return deleteResult;
        } catch (error) {
          logger.error(`❌ Error deleting image for product ${product.title}:`, error);
          return { success: false, error: error.message };
        }
      });

    // Wait for all image deletions to complete
    if (imageDeletePromises.length > 0) {
      await Promise.allSettled(imageDeletePromises);
    }

    return result;
  }

  /**
   * Upload product image - FIXED VERSION
   * @param {string} productId - Product ID
   * @param {string} sellerId - Seller profile ID
   * @param {Object} file - Uploaded file
   * @returns {Promise<Object>} Upload result
   */
  static async uploadProductImage(productId, sellerId, file) {
    let uploadResult = null; // FIXED: Declare outside try block
    let session = null;

    try {
      const product = await Product.findOne({
        _id: productId,
        sellerId,
      });

      if (!product) {
        return { success: false, message: "Product not found" };
      }

      // Upload new image to Cloudinary FIRST, before transaction
      uploadResult = await imageUploader.uploadImage(file, {
        folder: `ecommerce/products/${sellerId}/${productId}`,
        maxSize: 3 * 1024 * 1024, // 3MB
        dimensions: { width: 800, height: 600 },
        format: "webp",
      });

      if (!uploadResult.success) {
        return uploadResult;
      }

      // FIXED: Start transaction AFTER successful upload
      session = await mongoose.startSession();
      session.startTransaction();

      // Store old image for cleanup
      const oldImage = product.image;
      const oldCloudinaryPublicId = product.cloudinaryPublicId;

      // FIXED: Use findByIdAndUpdate with session for better concurrency
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        {
          $set: {
            image: uploadResult.imageUrl,
            cloudinaryPublicId: uploadResult.publicId,
            updatedAt: new Date(),
          },
        },
        {
          new: true,
          session,
          // FIXED: Add retry logic for write conflicts
          retryWrites: true,
        }
      );

      if (!updatedProduct) {
        throw new Error("Failed to update product");
      }

      await session.commitTransaction();

      // Background cleanup old image
      if (oldImage) {
        setImmediate(async () => {
          try {
            await imageUploader.deleteImage(oldCloudinaryPublicId || oldImage);
            logger.info(`Old image deleted: ${product.title}`);
          } catch (error) {
            logger.warn(`Background cleanup error: ${error.message}`);
          }
        });
      }

      logger.info(`Product image uploaded: ${product.title}`);

      return {
        success: true,
        imageUrl: uploadResult.imageUrl,
        publicId: uploadResult.publicId,
        metadata: uploadResult.metadata,
        productTitle: product.title,
      };
    } catch (error) {
      // Abort transaction if exists
      if (session) {
        await session.abortTransaction();
      }

      logger.error(`Error in uploadProductImage: ${error.message}`);

      // FIXED: Cleanup uploaded image only if upload was successful
      if (uploadResult?.success && uploadResult?.publicId) {
        try {
          await imageUploader.deleteImage(uploadResult.publicId);
          logger.info("Cleaned up uploaded image after transaction failure");
        } catch (cleanupError) {
          logger.warn(`Cleanup error: ${cleanupError.message}`);
        }
      }

      throw error;
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  /**
   * Get dashboard stats for seller - OPTIMIZED WITH ORDER DATA
   * @param {string} sellerId - Seller profile ID
   * @param {string} period - Time period (7d, 30d, 90d)
   * @returns {Promise<Object>} Dashboard statistics
   */
  static async getDashboardStats(sellerId, period = "30d") {
    const now = new Date();
    const startDate = SellerProductService.getStartDate(period, now);
    const Order = mongoose.model("Order");

    // ✅ SINGLE OPTIMIZED AGGREGATION dengan $facet
    const [stats] = await Order.aggregate([
      {
        $match: {
          "cartSnapshot.items.productSnapshot.seller._id": sellerId,
          createdAt: { $gte: startDate },
          status: { $nin: ["cancelled", "refunded"] },
        },
      },
      {
        $facet: {
          // Revenue & Orders summary
          summary: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                totalOrders: { $sum: 1 },
              },
            },
          ],

          // Previous period untuk comparison
          previousPeriod: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(startDate.getTime() - (now.getTime() - startDate.getTime())),
                  $lt: startDate,
                },
              },
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                totalOrders: { $sum: 1 },
              },
            },
          ],

          // Daily trend untuk charts
          dailyTrend: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 30 },
          ],

          // Top products by revenue
          topProducts: [
            { $unwind: "$cartSnapshot.items" },
            {
              $match: {
                "cartSnapshot.items.productSnapshot.seller._id": sellerId,
              },
            },
            {
              $group: {
                _id: "$cartSnapshot.items.product",
                title: { $first: "$cartSnapshot.items.productSnapshot.title" },
                image: { $first: "$cartSnapshot.items.productSnapshot.image" },
                category: { $first: "$cartSnapshot.items.productSnapshot.category.name" },
                sales: { $sum: "$cartSnapshot.items.quantity" },
                revenue: {
                  $sum: {
                    $multiply: ["$cartSnapshot.items.priceAtPurchase", "$cartSnapshot.items.quantity"],
                  },
                },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]);

    // Get product stats (lightweight)
    const [productStats] = await Product.aggregate([
      { $match: { sellerId, deletedAt: null } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ["$isActive", 1, 0] } },
        },
      },
    ]);

    const current = stats.summary[0] || { totalRevenue: 0, totalOrders: 0 };
    const previous = stats.previousPeriod[0] || { totalRevenue: 0, totalOrders: 0 };
    const products = productStats || { total: 0, active: 0 };

    // Calculate changes
    const revenueChange =
      previous.totalRevenue > 0
        ? Math.round(((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100)
        : 0;

    const ordersChange =
      previous.totalOrders > 0
        ? Math.round(((current.totalOrders - previous.totalOrders) / previous.totalOrders) * 100)
        : 0;

    const productsChange = 0; // Products don't change frequently

    const conversionRate =
      current.totalOrders > 0 && products.total > 0
        ? Math.round((current.totalOrders / products.total) * 100 * 10) / 10
        : 0;

    return {
      // Stats cards
      totalRevenue: current.totalRevenue,
      revenueChange,
      totalOrders: current.totalOrders,
      ordersChange,
      activeProducts: products.active,
      productsChange,
      conversionRate,
      conversionChange: 0,

      // Charts data
      revenueData: stats.dailyTrend.map(d => ({
        date: d._id,
        value: d.revenue,
      })),
      ordersData: stats.dailyTrend.map(d => ({
        date: d._id,
        value: d.orders,
      })),

      // Top products
      topProducts: stats.topProducts.map(p => ({
        id: p._id.toString(),
        title: p.title,
        image: p.image || null,
        category: p.category || null,
        sales: p.sales,
        totalSales: p.sales,
        revenue: p.revenue,
        totalRevenue: p.revenue,
        growth: 0, // Bisa dihitung nanti jika perlu comparison
        growthRate: 0,
        views: 0, // Data views butuh tracking terpisah
      })),

      period,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Get comprehensive product statistics for a seller
   * Optimized with single aggregation pipeline using $facet
   */
  static async getProductStats(sellerId, period = "30d") {
    const now = new Date();
    const startDate = SellerProductService.getStartDate(period, now); // FIXED: Tambahkan SellerProductService.

    // ✅ Single optimized aggregation with $facet
    const [stats] = await Product.aggregate([
      {
        $match: {
          sellerId,
          deletedAt: null, // Exclude soft-deleted products
        },
      },
      {
        $facet: {
          // Summary statistics
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: ["$isActive", 1, 0] } },
                inactive: { $sum: { $cond: ["$isActive", 0, 1] } },
              },
            },
          ],

          // Price statistics
          pricing: [
            {
              $group: {
                _id: null,
                minPrice: { $min: "$price" },
                maxPrice: { $max: "$price" },
                averagePrice: { $avg: "$price" },
                totalInventoryValue: {
                  $sum: { $multiply: ["$price", "$stock"] },
                },
              },
            },
          ],

          // Category breakdown
          categoryGroups: [
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
                activeCount: { $sum: { $cond: ["$isActive", 1, 0] } },
                averagePrice: { $avg: "$price" },
                totalStock: { $sum: "$stock" },
              },
            },
            { $sort: { count: -1 } },
          ],

          // Monthly trend
          monthlyTrend: [
            {
              $match: {
                createdAt: { $gte: startDate },
              },
            },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
            {
              $project: {
                _id: 0,
                period: {
                  $concat: [
                    { $toString: "$_id.year" },
                    "-",
                    {
                      $cond: [
                        { $lt: ["$_id.month", 10] },
                        { $concat: ["0", { $toString: "$_id.month" }] },
                        { $toString: "$_id.month" },
                      ],
                    },
                  ],
                },
                count: 1,
              },
            },
          ],
        },
      },
    ]).exec(); // ✅ .exec() returns lean by default for aggregation

    // Get category names in one query (only for categories that exist)
    const categoryIds = stats.categoryGroups.map(c => c._id);
    const categories = await Category.find({ _id: { $in: categoryIds } }, { _id: 1, name: 1 }).lean(); // ✅ Use .lean() for read-only data

    // Create category lookup map
    const categoryMap = categories.reduce((acc, cat) => {
      acc[cat._id.toString()] = cat.name;
      return acc;
    }, {});

    // Transform response
    const summary = stats.summary[0] || { total: 0, active: 0, inactive: 0 };
    const pricing = stats.pricing[0] || {
      minPrice: 0,
      maxPrice: 0,
      averagePrice: 0,
      totalInventoryValue: 0,
    };

    return {
      period,
      dateRange: {
        startDate,
        endDate: now,
      },
      summary: {
        totalProducts: summary.total,
        activeProducts: summary.active,
        inactiveProducts: summary.inactive,
      },
      categories: stats.categoryGroups.map(cat => ({
        id: cat._id.toString(),
        name: categoryMap[cat._id.toString()] || "Unknown",
        count: cat.count,
        activeCount: cat.activeCount,
        averagePrice: Math.round(cat.averagePrice * 100) / 100,
        totalStock: cat.totalStock,
      })),
      pricing: {
        minPrice: pricing.minPrice,
        maxPrice: pricing.maxPrice,
        averagePrice: Math.round(pricing.averagePrice * 100) / 100,
        totalInventoryValue: pricing.totalInventoryValue,
      },
      trends: {
        monthly: stats.monthlyTrend,
      },
    };
  }

  /**
   * Helper function to get start date based on period
   * @param {string} period - Period (7d, 30d, 90d, 1y)
   * @param {Date} now - Current date
   * @returns {Date} Start date
   */
  static getStartDate(period, now) {
    const periodMap = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "1y": 365,
    };

    const days = periodMap[period] || 30;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  /**
   * Get store products (public)
   * @param {string} sellerId - Seller profile ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Store products with pagination
   */
  static async getStoreProducts(sellerId, options = {}) {
    const {
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortOrder = "desc",
      category,
      minPrice,
      maxPrice,
      search,
      inStock,
    } = options;

    // Build match criteria
    const match = {
      sellerId: sellerId,
      isActive: true,
    };

    // Apply filters
    if (category) match.category = category;
    if (minPrice !== undefined) match.price = { $gte: parseFloat(minPrice) };
    if (maxPrice !== undefined) match.price = { ...match.price, $lte: parseFloat(maxPrice) };
    if (inStock === "true") match.stock = { $gt: 0 };
    if (inStock === "false") match.stock = { $eq: 0 };
    if (search) {
      match.$or = [{ title: new RegExp(search, "i") }, { description: new RegExp(search, "i") }];
    }

    // Sort direction
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Get products with pagination
    const products = await Product.find(match)
      .sort({ [sortBy]: sortDirection })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("category", "name"); // Only get name, not description

    // Transform products to consistent format
    const transformedProducts = products.map(product => ({
      id: product._id.toString(),
      title: product.title,
      description: product.description,
      price: product.price,
      priceFormatted: `Rp ${product.price.toLocaleString("id-ID")}`,
      image: product.image || null,
      category: product.category?.name || null,
      stock: product.stock,
      rating: product.rating || 0,
      reviews: product.reviews || 0,
      isActive: product.isActive,
      createdAt: product.createdAt,
    }));

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(match);

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const totalPages = Math.ceil(totalProducts / parsedLimit);

    return {
      products: transformedProducts,
      pagination: {
        currentPage: parsedPage,
        totalPages: totalPages,
        totalItems: totalProducts,
        itemsPerPage: parsedLimit,
        hasNext: parsedPage < totalPages,
        hasPrev: parsedPage > 1,
      },
    };
  }

  static async getStoreProductsWithMeta(slug, options = {}) {
    // Get seller profile first
    const sellerProfile = await SellerProfileService.findBySlug(slug);
    if (!sellerProfile) {
      return null;
    }

    // Get products using existing method
    const result = await this.getStoreProducts(sellerProfile._id, options);

    // Return with minimal store meta
    return {
      products: result.products,
      pagination: result.pagination,
      store: {
        id: sellerProfile._id.toString(),
        name: sellerProfile.storeName,
        slug: sellerProfile.storeSlug,
        logo: sellerProfile.logo || null,
      },
      filters: {
        category: options.category || null,
        search: options.search || null,
        price: {
          min: options.minPrice ? parseFloat(options.minPrice) : null,
          max: options.maxPrice ? parseFloat(options.maxPrice) : null,
        },
        inStock: options.inStock ? options.inStock === "true" : null,
        sort: {
          by: options.sortBy || "createdAt",
          order: options.sortOrder || "desc",
        },
      },
    };
  }
}

module.exports = SellerProductService;
