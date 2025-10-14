// search.controller.js
const Product = require("../models/products.model");
const Category = require("../models/category.model");
const SellerProfile = require("../models/seller-profile.model");
const logger = require("../utils/logger");

class SearchController {
  static async searchProducts(req, res) {
    try {
      const {
        q: searchTerm,
        category,
        sellerId,
        minPrice,
        maxPrice,
        sortBy = "relevance",
        page = 1,
        limit = 10,
      } = req.query;

      if (!searchTerm || searchTerm.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Search term must be at least 2 characters long",
        });
      }

      // Parse dan validate price filters
      const parsedMinPrice = minPrice ? parseFloat(minPrice) : undefined;
      const parsedMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;

      // Validate parsed prices
      const validMinPrice = parsedMinPrice && !isNaN(parsedMinPrice) ? parsedMinPrice : undefined;
      const validMaxPrice = parsedMaxPrice && !isNaN(parsedMaxPrice) ? parsedMaxPrice : undefined;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        category,
        sellerId,
        minPrice: validMinPrice,
        maxPrice: validMaxPrice,
        sortBy,
      };

      const products = await Product.searchProducts(searchTerm.trim(), options);

      // Build count query with validated prices
      const countQuery = {
        $and: [
          { isActive: true },
          { deletedAt: null },
          {
            $or: [{ title: new RegExp(searchTerm.trim(), "i") }, { description: new RegExp(searchTerm.trim(), "i") }],
          },
        ],
        ...(category && { category }),
        ...(sellerId && { sellerId }),
      };

      // Only add price filters if they are valid numbers
      if (validMinPrice !== undefined) {
        countQuery.price = { ...countQuery.price, $gte: validMinPrice };
      }
      if (validMaxPrice !== undefined) {
        countQuery.price = { ...countQuery.price, $lte: validMaxPrice };
      }

      const totalCount = await Product.countDocuments(countQuery);

      res.json({
        success: true,
        data: {
          products,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / limit),
            totalItems: totalCount,
            itemsPerPage: parseInt(limit),
            hasNext: page * limit < totalCount,
            hasPrev: page > 1,
          },
          searchTerm,
          filters: {
            category,
            sellerId,
            minPrice,
            maxPrice,
            sortBy,
          },
        },
        message: `Found ${totalCount} products for "${searchTerm}"`,
      });
    } catch (error) {
      logger.error("Search products error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to search products",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }

  static async getSearchSuggestions(req, res) {
    try {
      const { q: query, limit = 5 } = req.query;

      if (!query || query.trim().length < 2) {
        return res.json({
          success: true,
          data: {
            products: [],
            categories: [],
            sellers: [],
          },
          message: "Query too short for suggestions",
        });
      }

      const searchRegex = new RegExp(query.trim(), "i");

      // Product suggestions
      const productSuggestions = await Product.find({
        title: searchRegex,
        isActive: true,
        deletedAt: null,
      })
        .select("title slug")
        .limit(parseInt(limit))
        .lean();

      // Category suggestions
      const categorySuggestions = await Category.find({
        name: searchRegex,
        isActive: true,
      })
        .select("name")
        .limit(parseInt(limit))
        .lean();

      // Seller suggestions
      const sellerSuggestions = await SellerProfile.find({
        storeName: searchRegex,
        status: "active",
        isArchived: false,
        deletedAt: null,
      })
        .select("storeName storeSlug logo")
        .limit(parseInt(limit))
        .lean();

      res.json({
        success: true,
        data: {
          products: productSuggestions.map(p => ({
            title: p.title,
            slug: p.slug,
          })),
          categories: categorySuggestions.map(c => ({
            name: c.name,
          })),
          sellers: sellerSuggestions.map(s => ({
            storeName: s.storeName,
            storeSlug: s.storeSlug,
            logo: s.logo,
          })),
        },
        message: "Search suggestions retrieved successfully",
      });
    } catch (error) {
      logger.error("Get search suggestions error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get search suggestions",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }
}

module.exports = SearchController;
