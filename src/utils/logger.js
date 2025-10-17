// ========================================
// FILE: src/utils/logger.js
// ========================================

// Ensure dotenv is loaded if not already (with quiet option)
if (!process.env.NODE_ENV) {
  require('dotenv').config({ quiet: true });
}

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ✅ DETECT VERCEL SERVERLESS
const isVercel = process.env.VERCEL === "1" || process.env.NOW_REGION;

// ✅ ONLY CREATE LOGS FOLDER IF NOT VERCEL
let logsDir;
if (!isVercel) {
  logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Get current environment - with fallback
const currentEnv = process.env.NODE_ENV || 'development';

// Custom format for console output with colors and emojis
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
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

// ✅ SETUP TRANSPORTS - CONDITIONAL BASED ON VERCEL
const transports = [];

// Only add file transports if NOT on Vercel
if (!isVercel) {
  transports.push(
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true
    }),
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true
    }),
    // Audit logs
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'info',
      maxsize: 10485760,
      maxFiles: 10,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          if (message.includes('Login') || message.includes('Registration') || 
              message.includes('Logout') || message.includes('Password') ||
              message.includes('OTP') || message.includes('Token')) {
            return JSON.stringify({ timestamp, level, message, ...meta });
          }
          return false;
        })
      )
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: {
    service: 'ecommerce-api',
    environment: currentEnv,
    platform: isVercel ? 'vercel-serverless' : 'standard'
  },
  transports,
  
  // ✅ ONLY ADD EXCEPTION/REJECTION HANDLERS IF NOT VERCEL
  ...((!isVercel) && {
    exceptionHandlers: [
      new winston.transports.File({ 
        filename: path.join(logsDir, 'exceptions.log'),
        maxsize: 5242880,
        maxFiles: 3
      })
    ],
    rejectionHandlers: [
      new winston.transports.File({ 
        filename: path.join(logsDir, 'rejections.log'),
        maxsize: 5242880,
        maxFiles: 3
      })
    ]
  })
});

// Environment-specific console transport
if (currentEnv === 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    level: 'warn',
    handleExceptions: true,
    handleRejections: true
  }));
  
  logger.info(`🚀 Logger initialized for PRODUCTION ${isVercel ? '(Vercel Serverless)' : ''}`);
} else {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  }));

  logger.info(`🔧 Logger initialized for DEVELOPMENT`);
}

logger.info(`📊 Current NODE_ENV: ${currentEnv}`);

// Custom methods
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

// Graceful shutdown (skip on Vercel)
if (!isVercel) {
  process.on('SIGINT', () => {
    logger.info('🛑 Application shutting down gracefully...');
    logger.end();
  });

  process.on('SIGTERM', () => {
    logger.info('🛑 Application terminated...');
    logger.end();
  });
}

module.exports = logger;