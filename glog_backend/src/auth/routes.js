const express = require('express');
const router = express.Router();
const authenticate = require('./middleware');
const {
  redirectToGithub,
  githubCallback,
  refreshAccessToken,
  logout,
  getMe,
  completeSetup,
} = require('./controller');
const { claimDailyReward } = require('./dailyReward');

router.get('/github', redirectToGithub);
router.get('/github/callback', githubCallback);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.post('/setup', authenticate, completeSetup);
router.post('/daily-reward', authenticate, claimDailyReward);

module.exports = router;
