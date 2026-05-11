const express = require('express');
const router = express.Router();

router.use('/auth', require('../auth/routes'));

// 이후 라우터 추가:
// router.use('/users', require('./users'));
// router.use('/posts', require('./posts'));
// router.use('/feed', require('./feed'));

module.exports = router;
