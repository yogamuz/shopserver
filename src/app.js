///app.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const compression = require("compression");

// Import configurations
const { validateEnvironment } = require("./config/env");
const { getCorsConfig } = require("./config/cors");
const { setupSecurityMiddlewares } = require("./config/security");

// Import startup modules
const { connectDatabase } = require("./config/database");
const { initializeCache } = require("./config/cache");
const { verifyConfig } = require("./config/cloudinary");

// Import logger and error handler
const logger = require("./utils/logger");
const errorHandler = require("./middlewares/errorHandler");

// ========================================
// APP INITIALIZATION
// ========================================

const app = express();

// Validate environment first
validateEnvironment();

// Trust proxy in production
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ========================================
// MIDDLEWARE SETUP
// ========================================

// Compression middleware - compress all responses
app.use(compression());

// CORS configuration
app.use(cors(getCorsConfig()));

// Basic middlewares
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser("secret-key"));

// Security middlewares setup
setupSecurityMiddlewares(app);

// ========================================
// INITIALIZE EXTERNAL SERVICES
// ========================================

// Database connection
connectDatabase();
const OrderService = require("./services/order/order.service");
OrderService.startExpirationChecker();
OrderService.startAutoReceiveChecker();
// Initialize Cache System
initializeCache();

// Verify Cloudinary
verifyConfig();

// ========================================
// ROUTES SETUP
// ========================================

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    refreshTokenFeature: "Enabled",
    cacheStatus: "Active"
  });
});

// API ROUTES
app.use("/api", require("./routes/index.routes"));

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ message: "Route not found" });
});

// Global error handler middleware (must be last)
app.use(errorHandler);

module.exports = app;