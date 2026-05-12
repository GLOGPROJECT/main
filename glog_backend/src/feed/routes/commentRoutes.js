const express = require('express');
const authenticate = require('../../auth/middleware');
const commentController = require('../controllers/commentController');

const router = express.Router();

router.delete('/:commentId', authenticate, commentController.deleteComment);

module.exports = router;
