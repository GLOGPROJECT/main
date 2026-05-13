-- glogdb: posts.post_id 에 AUTO_INCREMENT 부여 (Prisma @default(autoincrement) 와 일치)
-- Workbench 등에서 glogdb 선택 후 순서대로 실행
-- FK 이름은 information_schema 기준 (환경마다 다르면 KEY_COLUMN_USAGE 로 확인)

SET NAMES utf8mb4;

ALTER TABLE `comments` DROP FOREIGN KEY `FK_posts_TO_comments_1`;
ALTER TABLE `post_hashtags` DROP FOREIGN KEY `FK_posts_TO_post_hashtags_1`;
ALTER TABLE `post_images` DROP FOREIGN KEY `FK_posts_TO_post_images_1`;
ALTER TABLE `post_likes` DROP FOREIGN KEY `FK_posts_TO_post_likes_1`;
ALTER TABLE `posts` DROP FOREIGN KEY `FK_users_TO_posts_1`;

ALTER TABLE `posts` MODIFY `post_id` INT NOT NULL AUTO_INCREMENT;

-- 기존 데이터가 있으면 다음 값 조정 (예: SELECT COALESCE(MAX(post_id),0)+1 FROM posts;)
-- ALTER TABLE posts AUTO_INCREMENT = N;

ALTER TABLE `posts` ADD CONSTRAINT `FK_users_TO_posts_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `comments` ADD CONSTRAINT `FK_posts_TO_comments_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`post_id`);
ALTER TABLE `post_hashtags` ADD CONSTRAINT `FK_posts_TO_post_hashtags_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`post_id`);
ALTER TABLE `post_images` ADD CONSTRAINT `FK_posts_TO_post_images_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`post_id`);
ALTER TABLE `post_likes` ADD CONSTRAINT `FK_posts_TO_post_likes_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`post_id`);
