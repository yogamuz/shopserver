const express = require('express');
const router = express.Router();
const SearchController = require('../../controllers/search.controller');
const { searchCache } = require('../../middlewares/cache-middleware');

// Search routes with cache middleware
router.get('/', searchCache, SearchController.searchProducts);
router.get('/suggestions', searchCache, SearchController.getSearchSuggestions);

module.exports = router;