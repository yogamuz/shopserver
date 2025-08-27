// middlewares/rateLimitMiddleware.js
const rateLimit = require('express-rate-limit');

// Rate limit untuk API user (lebih ketat)
exports.userApiLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  trustProxy: true, // Fix untuk trust proxy warning
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Untuk development, bisa skip localhost
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && 
           (req.ip === '127.0.0.1' || req.ip === '::1');
  }
});

// Rate limit untuk admin API (sangat ketat)
exports.adminApiLimit = rateLimit({
  windowMs: 1000 * 5, // 5 seconds  
  max: 100, // Admin bisa lebih banyak request
  trustProxy: true, // Fix untuk trust proxy warning
  message: {
    success: false,
    message: 'Too many admin requests, please try again later.',
    retryAfter: '5 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit untuk auth endpoints (sangat ketat untuk prevent brute force)
exports.authLimit = rateLimit({
  windowMs: 1000 * 5, // 5 seconds
  max: 5, // Hanya 5 login attempts per 5 detik
  trustProxy: true, // Fix untuk trust proxy warning
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 5 seconds.',
    retryAfter: '5 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false
  // Removed custom keyGenerator to fix IPv6 issue
  // Default keyGenerator sudah handle IPv6 dengan baik
});

// Rate limit umum untuk API lainnya
exports.generalApiLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  trustProxy: true, // Fix untuk trust proxy warning
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});