const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const path = require("path");

// Import logger AFTER dotenv is loaded
const logger = require("./utils/logger");

// Error handler middleware
const errorHandler = require("./middlewares/errorHandler");

// routes path
const cartRoutes = require("./routes/cart.routes");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const productRoutes = require("./routes/product.routes");
const categoryRoutes = require("./routes/category.routes");
const sellerRoutes = require("./routes/seller.routes");

// IMPORTANT: Set refresh token secret if not exists
if (!process.env.REFRESH_SECRET) {
  logger.warn("⚠️  REFRESH_SECRET not found in .env, using fallback");
  process.env.REFRESH_SECRET =
    process.env.JWT_SECRET + "_refresh" ||
    "fallback-refresh-secret-key-change-in-production";
}

logger.info("🔐 Environment variables check:");
logger.info("✅ JWT_SECRET:", process.env.JWT_SECRET ? "✅ Set" : "❌ Missing");
logger.info(
  "✅ REFRESH_SECRET:",
  process.env.REFRESH_SECRET ? "✅ Set" : "❌ Missing"
);
logger.info("✅ NODE_ENV:", process.env.NODE_ENV || "developmentsssss");

const app = express();
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Compression middleware - compress all responses
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://localhost:5173", // Vite dev server
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "x-session-id",
      "x-content-type-options", // ⬅️ ini yang bikin error
    ],
  })
);

// Helmet configuration
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// middlewares
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser("secret-key"));

// ✅ CLEAN: Static files middleware - serve files from public folder
app.use(
  express.static(path.join(process.cwd(), "public"), {
    maxAge: "1d",
    etag: true,
    setHeaders: (res, filePath) => {
      // Set CORS headers for all static files
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
      );
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      // Set proper MIME types for images
      if (filePath.endsWith(".webp")) {
        res.setHeader("Content-Type", "image/webp");
      } else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
        res.setHeader("Content-Type", "image/jpeg");
      } else if (filePath.endsWith(".png")) {
        res.setHeader("Content-Type", "image/png");
      } else if (filePath.endsWith(".gif")) {
        res.setHeader("Content-Type", "image/gif");
      }
    },
  })
);

// Debug middleware untuk log semua request ke static files
// Enhanced debug middleware for ALL requests
app.use((req, res, next) => {
  // Log all requests to help debug
  logger.info(`📥 Request: ${req.method} ${req.url}`);

  // Special handling for image requests
  if (
    req.url.includes(".webp") ||
    req.url.includes(".jpg") ||
    req.url.includes(".png")
  ) {
    logger.info(`🖼️  Image request detected: ${req.method} ${req.url}`);

    // Fix: Remove the extra 'src' from path construction
    const filePath = path.join(process.cwd(), "public", req.url);
    logger.info(`📁 Looking for file: ${filePath}`);

    // Check if file exists
    const fs = require("fs");
    try {
      if (fs.existsSync(filePath)) {
        logger.info(`✅ File exists: ${filePath}`);
      } else {
        logger.error(`❌ File NOT found: ${filePath}`);
      }
    } catch (error) {
      logger.error(`🚨 Error checking file: ${error.message}`);
    }
  }
  next();
});

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("✅ MongoDB Connected"))
  .catch((err) => logger.error("❌ MongoDB connection error:", err));

// Routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    refreshTokenFeature: "✅ Enabled",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/seller", sellerRoutes);
// app.use("/api/profile", profileRoutes)
// app.use("/api/email", emailRoutes)

// Error handling
app.use((req, res) => {
  logger.warn(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ message: "Route not found" });
});

// Global error handler middleware (must be last)
app.use(errorHandler);

module.exports = app;
