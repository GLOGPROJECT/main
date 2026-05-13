const express = require('express');
const authenticate = require('../../auth/middleware');
const optionalAuthenticate = require('../../auth/optionalAuthMiddleware');
const feedController = require('../controllers/feedController');
const { uploadImages } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.get('/', optionalAuthenticate, feedController.listFeed);
router.get('/following/members', authenticate, feedController.listFollowingMembers);
router.get('/following', authenticate, feedController.listFollowingFeed);
router.get('/user/:userId', optionalAuthenticate, feedController.listUserFeed);

router.get('/suggested-users', authenticate, feedController.listSuggestedUsers);
router.post('/follow/:targetUserId', authenticate, feedController.followUser);
router.delete('/follow/:targetUserId', authenticate, feedController.unfollowUser);

router.get('/weekly-activity', authenticate, feedController.getWeeklyActivity);

router.get('/embed/preview', authenticate, feedController.getLinkPreview);

router.get('/:postId/comments', optionalAuthenticate, feedController.listComments);
router.get('/:postId', optionalAuthenticate, feedController.getPost);
router.post('/:postId/comments', authenticate, feedController.createComment);

router.post('/:postId/like', authenticate, feedController.toggleLike);

router.patch('/:postId', authenticate, uploadImages, feedController.updatePost);
router.delete('/:postId', authenticate, feedController.deletePost);

router.post('/', authenticate, uploadImages, feedController.createPost);

module.exports = router;
