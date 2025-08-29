// ========================================
// FILE: server.js
// ========================================

// CRITICAL: Load environment variables FIRST before any other imports
// Add { quiet: true } to suppress dotenv logs
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ quiet: true });
}


// Now import app after environment variables are loaded
const app = require("./src/app");

// Import logger after dotenv is configured
const logger = require('./src/utils/logger');

// Set port
const PORT = process.env.PORT || 3001;

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server is running on port ${PORT}`);
  logger.info(`📍 API available at: http://localhost:${PORT}/api`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/api/health`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
  logger.error(err.name, err.message);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('💥 UNHANDLED REJECTION! Shutting down...');
  logger.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = server;