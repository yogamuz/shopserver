// ========================================
// FILE: index.js (CREATE DI ROOT PROJECT)
// Vercel Serverless Entry Point
// ========================================

// Load environment variables
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ quiet: true });
}

// Import the Express app
const app = require("./src/app");

// Export for Vercel serverless
module.exports = app;