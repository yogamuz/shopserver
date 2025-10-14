// cache.routes.js
const express = require('express');
const router = express.Router();
const { cacheRoutes } = require('../../middlewares/cache-middleware');


// Mount cache management routes
router.use('/', cacheRoutes);




module.exports = router;