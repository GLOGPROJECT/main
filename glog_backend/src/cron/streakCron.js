const { syncAllUsersWithGithubToken } = require('../services/streakSyncService');

let started = false;

function startStreakSyncScheduler() {
  if (started) return;
  started = true;
  const HOUR = 60 * 60 * 1000;
  const tick = () => {
    syncAllUsersWithGithubToken()
      .then((r) => console.log('[streak hourly sync]', r))
      .catch((e) => console.error('[streak hourly sync]', e.message));
  };
  setTimeout(tick, 15_000);
  setInterval(tick, HOUR);
}

module.exports = { startStreakSyncScheduler };
