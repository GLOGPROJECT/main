-- 코딩 스트릭(GitHub 기여) 확장: users 컬럼 + contribution_days 테이블
-- 적용: mysql 클라이언트에서 DATABASE 선택 후 실행, 또는 CI에서 순서대로 적용

ALTER TABLE `users`
  ADD COLUMN `github_access_token` TEXT NULL AFTER `is_setup_complete`,
  ADD COLUMN `github_login` VARCHAR(39) NULL AFTER `github_access_token`,
  ADD COLUMN `include_private_contributions` BOOLEAN NOT NULL DEFAULT FALSE AFTER `github_login`,
  ADD COLUMN `last_streak_manual_refresh_at` DATETIME(3) NULL AFTER `include_private_contributions`;

CREATE TABLE `contribution_days` (
  `user_id` INT NOT NULL,
  `activity_date` DATE NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `activity_date`),
  CONSTRAINT `contribution_days_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
