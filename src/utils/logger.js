// ========================================
// FILE: src/utils/logger.js
// ========================================

// Ensure dotenv is loaded if not already (with quiet option)
if (!process.env.NODE_ENV) {
  require('dotenv').config({ quiet: true });
}

const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Get current environment - with fallback (FIXED: removed extra 'sssss')
const currentEnv = process.env.NODE_ENV || 'development';

// Custom format for console output with colors and emojis
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if exists
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Custom format for file output (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: {
    service: 'ecommerce-api',
    environment: currentEnv // Use the variable we set above
  },
  transports: [
    // Error logs - separate file for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    // Combined logs - all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    // Audit logs - for authentication and user activities
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Only log audit-related messages to this file
          if (message.includes('Login') || message.includes('Registration') || 
              message.includes('Logout') || message.includes('Password') ||
              message.includes('OTP') || message.includes('Token')) {
            return JSON.stringify({ timestamp, level, message, ...meta });
          }
          return false;
        })
      )
    })
  ],

  // Handle uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

// Environment-specific console transport configuration
if (currentEnv === 'production') {
  // Production: JSON format, minimal console output (warn & error only)
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    level: 'warn', // Only warn and error levels in production console
    handleExceptions: true,
    handleRejections: true
  }));

  // Production-specific: You can add additional transports here
  // Examples:
  // - Database logging transport
  // - External logging services (Elasticsearch, Splunk, Datadog, etc.)
  // - Email notifications for critical errors
  // - Slack/Teams notifications
  
  logger.info(`🚀 Logger initialized for PRODUCTION environment`);
} else {
  // Development: Colorful console output with all levels
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  }));

  logger.info(`🔧 Logger initialized for DEVELOPMENT environment`);
}

// Log the current environment for debugging
logger.info(`📊 Current NODE_ENV: ${currentEnv}`);

// Add custom methods for specific use cases
logger.audit = (message, metadata = {}) => {
  logger.info(`[AUDIT] ${message}`, { 
    ...metadata, 
    type: 'audit',
    timestamp: new Date().toISOString() 
  });
};

logger.security = (message, metadata = {}) => {
  logger.warn(`[SECURITY] ${message}`, { 
    ...metadata, 
    type: 'security',
    timestamp: new Date().toISOString() 
  });
};

logger.performance = (message, metadata = {}) => {
  logger.info(`[PERFORMANCE] ${message}`, { 
    ...metadata, 
    type: 'performance',
    timestamp: new Date().toISOString() 
  });
};

// Helper function to log HTTP requests
logger.logRequest = (req, res, responseTime) => {
  const { method, url, ip, headers } = req;
  const { statusCode } = res;
  
  logger.info(`${method} ${url}`, {
    type: 'http_request',
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    ip,
    userAgent: headers['user-agent'],
    timestamp: new Date().toISOString()
  });
};

// Helper function to log database operations
logger.logDatabase = (operation, collection, query = {}, executionTime) => {
  logger.info(`DB ${operation} on ${collection}`, {
    type: 'database',
    operation,
    collection,
    query: JSON.stringify(query),
    executionTime: `${executionTime}ms`,
    timestamp: new Date().toISOString()
  });
};

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Application shutting down gracefully...');
  logger.end();
});

process.on('SIGTERM', () => {
  logger.info('🛑 Application terminated...');
  logger.end();
});

module.exports = logger;