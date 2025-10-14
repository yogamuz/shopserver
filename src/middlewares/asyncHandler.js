/**
 * Async handler middleware to avoid try-catch blocks in controllers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const logger = require('../utils/logger')
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    logger.error('AsyncHandler Error:', error);
    // Pastikan error message dikirim
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Internal server error' // ← Jangan kosong
    });
  });
};

module.exports = asyncHandler;