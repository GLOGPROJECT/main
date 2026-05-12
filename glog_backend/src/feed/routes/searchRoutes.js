const express = require('express');
const optionalAuthenticate = require('../../auth/optionalAuthMiddleware');
const searchController = require('../controllers/searchController');

const router = express.Router();

router.get('/autocomplete', optionalAuthenticate, searchController.autocomplete);
router.get('/', optionalAuthenticate, searchController.search);

module.exports = router;
