// middlewares/staticMiddleware.js
const express = require('express');
const path = require('path');

const setupStaticFiles = (app) => {
  // Serve static files from uploads directory
  app.use('/api/images', express.static(path.join(__dirname, '../uploads/products')));
};

module.exports = setupStaticFiles;