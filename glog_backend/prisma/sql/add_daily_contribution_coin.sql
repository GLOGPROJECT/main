-- 일일 기여 코인: users.last_daily_coin_ymd + CoinReason.daily_contribution
ALTER TABLE `users`
  ADD COLUMN `last_daily_coin_ymd` VARCHAR(10) NULL AFTER `last_streak_manual_refresh_at`;

ALTER TABLE `coin_histories`
  MODIFY COLUMN `reason` ENUM(
    'streak_1',
    'streak_7',
    'streak_30',
    'streak_100',
    'trophy_silver',
    'trophy_gold',
    'achievement',
    'daily_contribution'
  ) NOT NULL;
