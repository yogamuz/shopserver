// ========================================
// FILE: config/security.js
// ========================================
const helmet = require("helmet");
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

const getHelmetConfig = () => ({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
});

// Global XSS protection middleware
const xssProtection = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key]);
      }
    });
  }
  next();
};

const setupSecurityMiddlewares = (app) => {
  // Helmet configuration
  app.use(helmet(getHelmetConfig()));
  
  // Security middlewares (AFTER body parsing)
  app.use(mongoSanitize()); // Global mongo sanitization
  app.use(xssProtection); // Global XSS protection
};

module.exports = { 
  getHelmetConfig, 
  xssProtection, 
  setupSecurityMiddlewares 
};
