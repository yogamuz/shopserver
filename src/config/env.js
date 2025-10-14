// ========================================
// FILE: config/env.js
// ========================================
const logger = require("../utils/logger");

const validateEnvironment = () => {
  // IMPORTANT: Set refresh token secret if not exists
  if (!process.env.REFRESH_SECRET) {
    logger.warn("WARNING: REFRESH_SECRET not found in .env, using fallback");
    process.env.REFRESH_SECRET =
      process.env.JWT_SECRET + "_refresh" ||
      "fallback-refresh-secret-key-change-in-production";
  }

  logger.info("Environment variables check:");
  logger.info("JWT_SECRET:", process.env.JWT_SECRET ? "Set" : "Missing");
  logger.info("REFRESH_SECRET:", process.env.REFRESH_SECRET ? "Set" : "Missing");
  logger.info("NODE_ENV:", process.env.NODE_ENV || "development");
};

module.exports = { validateEnvironment };