-- 익명 게시글 미리보기·피드와 동일 아바타(0~9) 유지
ALTER TABLE `posts` ADD COLUMN `anonymous_avatar_index` INT NULL AFTER `type`;
