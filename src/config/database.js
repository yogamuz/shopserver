// ========================================
// FILE: startup/database.js
// ========================================
const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDatabase = () => {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => logger.info("MongoDB Connected"))
    .catch((err) => logger.error("MongoDB connection error:", err));
};

module.exports = { connectDatabase };