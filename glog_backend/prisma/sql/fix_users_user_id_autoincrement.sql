-- glogdb: users.user_id 에 AUTO_INCREMENT 부여
-- MySQL 1833 방지: users.user_id 를 참조하는 FK 를 잠시 제거 후 MODIFY, 다시 추가
-- Workbench 등에서 glogdb 선택 후 순서대로 실행

SET NAMES utf8mb4;

-- ========== 1) users.user_id 를 참조하는 외래키 제거 ==========
ALTER TABLE `user_achievements` DROP FOREIGN KEY `FK_users_TO_user_achievements_1`;
ALTER TABLE `coding_streaks` DROP FOREIGN KEY `FK_users_TO_coding_streaks_1`;
ALTER TABLE `user_status` DROP FOREIGN KEY `FK_users_TO_user_status_1`;
ALTER TABLE `follows` DROP FOREIGN KEY `FK_users_TO_follows_1`;
ALTER TABLE `follows` DROP FOREIGN KEY `FK_users_TO_follows_2`;
ALTER TABLE `blocks` DROP FOREIGN KEY `FK_users_TO_blocks_1`;
ALTER TABLE `blocks` DROP FOREIGN KEY `FK_users_TO_blocks_2`;
ALTER TABLE `post_likes` DROP FOREIGN KEY `FK_users_TO_post_likes_1`;
ALTER TABLE `coin_histories` DROP FOREIGN KEY `FK_users_TO_coin_histories_1`;
ALTER TABLE `projects` DROP FOREIGN KEY `FK_users_TO_projects_1`;
ALTER TABLE `trophy_likes` DROP FOREIGN KEY `FK_users_TO_trophy_likes_1`;
ALTER TABLE `comments` DROP FOREIGN KEY `FK_users_TO_comments_1`;
ALTER TABLE `posts` DROP FOREIGN KEY `FK_users_TO_posts_1`;
ALTER TABLE `user_hashtagsubs` DROP FOREIGN KEY `FK_users_TO_user_hashtagsubs_1`;
ALTER TABLE `user_items` DROP FOREIGN KEY `FK_users_TO_user_items_1`;

-- ========== 2) Prisma 와 맞춤: user_status.user_id 를 INT 로 (기존 BIGINT 이면 FK 재생성 시 안전) ==========
ALTER TABLE `user_status` MODIFY COLUMN `user_id` INT NOT NULL;

-- ========== 3) users.user_id AUTO_INCREMENT ==========
ALTER TABLE `users`
  MODIFY `user_id` INT NOT NULL AUTO_INCREMENT;

-- 기존 데이터가 있으면 다음 값 조정 (예: MAX(user_id)=5 이면 6 부터)
-- SELECT COALESCE(MAX(user_id),0)+1 FROM users;
-- ALTER TABLE users AUTO_INCREMENT = 6;

-- ========== 4) 외래키 다시 추가 (제공하신 DDL 이름 그대로) ==========
ALTER TABLE `user_achievements` ADD CONSTRAINT `FK_users_TO_user_achievements_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `coding_streaks` ADD CONSTRAINT `FK_users_TO_coding_streaks_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `user_status` ADD CONSTRAINT `FK_users_TO_user_status_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `follows` ADD CONSTRAINT `FK_users_TO_follows_1` FOREIGN KEY (`follower_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `follows` ADD CONSTRAINT `FK_users_TO_follows_2` FOREIGN KEY (`following_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `blocks` ADD CONSTRAINT `FK_users_TO_blocks_1` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `blocks` ADD CONSTRAINT `FK_users_TO_blocks_2` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `posts` ADD CONSTRAINT `FK_users_TO_posts_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `comments` ADD CONSTRAINT `FK_users_TO_comments_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `post_likes` ADD CONSTRAINT `FK_users_TO_post_likes_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `coin_histories` ADD CONSTRAINT `FK_users_TO_coin_histories_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `projects` ADD CONSTRAINT `FK_users_TO_projects_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `trophy_likes` ADD CONSTRAINT `FK_users_TO_trophy_likes_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `user_hashtagsubs` ADD CONSTRAINT `FK_users_TO_user_hashtagsubs_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `user_items` ADD CONSTRAINT `FK_users_TO_user_items_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);
