const express = require('express');
const hashtagController = require('../controllers/hashtagController');

const router = express.Router();

router.get('/autocomplete', hashtagController.autocomplete);
router.get('/popular', hashtagController.popular);

module.exports = router;
