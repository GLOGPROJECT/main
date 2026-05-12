/** F01 GET /tag/:tagname — /api/tag 마운트 */
const express = require('express');
const optionalAuthenticate = require('../../auth/optionalAuthMiddleware');
const feedController = require('../controllers/feedController');

const router = express.Router();

router.get('/:tagname', optionalAuthenticate, feedController.getTagFeed);

module.exports = router;
