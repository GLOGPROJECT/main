const express = require('express');
const router = express.Router();

router.use('/auth', require('../auth/routes'));
router.use('/stats', require('../stats/routes'));
router.use('/users', require('../users/routes'));

router.use('/feed', require('../feed/routes/feedRoutes'));
router.use('/tag', require('../feed/routes/tagRoutes'));
router.use('/comments', require('../feed/routes/commentRoutes'));
router.use('/hashtags', require('../feed/routes/hashtagRoutes'));
router.use('/search', require('../feed/routes/searchRoutes'));

router.use('/projects', require('../projects/routes'));

module.exports = router;
