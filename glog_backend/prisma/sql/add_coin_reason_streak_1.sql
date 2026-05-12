-- CoinReason에 streak_1 추가 (기존 값 유지)
ALTER TABLE `coin_histories`
  MODIFY COLUMN `reason` ENUM(
    'streak_1',
    'streak_7',
    'streak_30',
    'streak_100',
    'trophy_silver',
    'trophy_gold',
    'achievement'
  ) NOT NULL;
