const { HTTP_STATUS, MESSAGES } = require('../constants/httpStatus');
const logger = require('../utils/logger');
/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('❌ Global Error Handler:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    statusCode: err.statusCode
  });

  // Handle specific error types
  
  // Custom application errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `${field} '${value}' already exists`;
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        duplicateKey: err.keyValue 
      })
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        validationErrors: err.errors 
      })
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid token',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Token expired',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'File size too large',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Too many files uploaded',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Unexpected field') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Invalid file field name. Expected field name: "avatar"',
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        expectedField: 'avatar',
        hint: 'Make sure frontend sends file with field name "avatar"'
      })
    });
  }

  // Handle specific application messages
  if (err.message && err.message.includes('PROFILE.')) {
    const statusCode = getStatusCodeFromMessage(err.message);
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  if (err.message && err.message.includes('USER.')) {
    const statusCode = getStatusCodeFromMessage(err.message);
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  if (err.message && err.message.includes('AUTH.')) {
    const statusCode = getStatusCodeFromMessage(err.message);
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Default server error
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Helper function to determine status code from error message
 * @param {string} message - Error message
 * @returns {number} HTTP status code
 */
const getStatusCodeFromMessage = (message) => {
  // Common patterns for different status codes
  if (message.includes('not found') || message.includes('NOT_FOUND')) {
    return HTTP_STATUS.NOT_FOUND;
  }
  
  if (message.includes('already exists') || message.includes('ALREADY_EXISTS')) {
    return HTTP_STATUS.BAD_REQUEST;
  }
  
  if (message.includes('unauthorized') || message.includes('UNAUTHORIZED')) {
    return HTTP_STATUS.UNAUTHORIZED;
  }
  
  if (message.includes('forbidden') || message.includes('FORBIDDEN')) {
    return HTTP_STATUS.FORBIDDEN;
  }
  
  if (message.includes('validation') || message.includes('invalid') || 
      message.includes('required') || message.includes('INVALID')) {
    return HTTP_STATUS.BAD_REQUEST;
  }
  
  // Default to 500 for unknown errors
  return HTTP_STATUS.INTERNAL_SERVER_ERROR;
};

/**
 * Not Found Handler - for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = HTTP_STATUS.NOT_FOUND;
  next(error);
};

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.notFoundHandler = notFoundHandler;