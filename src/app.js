const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const path = require("path");
const { verifyConfig } = require("./config/cloudinary");

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
const checkoutRoutes = require("./routes/checkout.routes");
const orderRoutes = require("./routes/order.routes");
const adminRoutes = require("./routes/admin.routes");
const { uptime } = require("process");

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
// CORS configuration - PERBAIKAN FINAL
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        process.env.CLIENT_URL || "http://localhost:3000",
        "http://localhost:5173", // Vite dev server
        "https://localhost:5173", // HTTPS version
        "http://127.0.0.1:5173", // Alternative localhost
        "https://127.0.0.1:5173", // HTTPS alternative
      ];

      // PERBAIKAN: Allow semua localhost untuk development
      if (process.env.NODE_ENV !== "production") {
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(null, true);
        }
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("CORS blocked origin:", origin); // Debug log
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "x-session-id",
      "X-CSRF-Token",
      "Cache-Control",
      "Pragma",
    ],
    exposedHeaders: ["X-CSRF-Token", "Set-Cookie"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
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
    uptime: process.uptime(),
    refreshTokenFeature: "✅ Enabled",
  });
});
logger.info("🌥️ Cloudinary configuration check:");
const cloudinaryConfigured = verifyConfig();
if (!cloudinaryConfigured) {
  logger.warn(
    "⚠️ Cloudinary not configured properly - image uploads will fail"
  );
}
// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
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
