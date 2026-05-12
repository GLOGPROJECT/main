-- Prisma schema.prisma 와 MySQL 실DB 불일치 보정 (신규 파일 — 기존 스크립트와 Git 충돌 최소화)
-- 적용: Workbench 또는 `npx prisma db execute --file prisma/sql/fix_projects_trophies_prisma_mysql.sql`
-- 전제: `projects_id` 가 테이블 내에서 이미 유일(중복 행 없음). 중복이 있으면 먼저 데이터 정리 필요.

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------- projects: deploy_url / video_url ----------
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'deploy_url'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `projects` ADD COLUMN `deploy_url` VARCHAR(500) NULL AFTER `github_url`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'video_url'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `projects` ADD COLUMN `video_url` VARCHAR(500) NULL AFTER `image_url`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 길이·타입 Prisma(@db.VarChar(500), Boolean)에 맞춤
ALTER TABLE `projects` MODIFY COLUMN `title` VARCHAR(100) NOT NULL;
ALTER TABLE `projects` MODIFY COLUMN `description` VARCHAR(500) NOT NULL;
ALTER TABLE `projects` MODIFY COLUMN `github_url` VARCHAR(500) NULL;
ALTER TABLE `projects` MODIFY COLUMN `deploy_url` VARCHAR(500) NULL;
ALTER TABLE `projects` MODIFY COLUMN `image_url` VARCHAR(500) NULL;
ALTER TABLE `projects` MODIFY COLUMN `video_url` VARCHAR(500) NULL;
ALTER TABLE `projects` MODIFY COLUMN `is_deleted` TINYINT(1) NOT NULL DEFAULT 0;

-- 복합 PK (projects_id, user_id) → Prisma: projects_id 단일 PK + AUTO_INCREMENT
ALTER TABLE `projects` DROP PRIMARY KEY;
ALTER TABLE `projects` MODIFY COLUMN `projects_id` INT NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`projects_id`);

SET @m := (SELECT IFNULL(MAX(`projects_id`), 0) + 1 FROM `projects`);
SET @sql = CONCAT('ALTER TABLE `projects` AUTO_INCREMENT = ', @m);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- trophies: trophies_id AUTO_INCREMENT ----------
ALTER TABLE `trophies` MODIFY COLUMN `trophies_id` INT NOT NULL AUTO_INCREMENT;

SET @m := (SELECT IFNULL(MAX(`trophies_id`), 0) + 1 FROM `trophies`);
SET @sql = CONCAT('ALTER TABLE `trophies` AUTO_INCREMENT = ', @m);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- project_tags: Prisma에 user_id 없음 / project_tags_id 자동 증가 ----------
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_tags' AND COLUMN_NAME = 'user_id'
);
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE `project_tags` DROP COLUMN `user_id`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `project_tags` MODIFY COLUMN `project_tags_id` INT NOT NULL AUTO_INCREMENT;
SET @m := (SELECT IFNULL(MAX(`project_tags_id`), 0) + 1 FROM `project_tags`);
SET @sql = CONCAT('ALTER TABLE `project_tags` AUTO_INCREMENT = ', IFNULL(@m, 1));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- project_contributors (없을 때만 생성) ----------
CREATE TABLE IF NOT EXISTS `project_contributors` (
  `project_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`project_id`, `user_id`),
  KEY `idx_project_contributors_user` (`user_id`),
  CONSTRAINT `project_contributors_project_fk`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`projects_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_contributors_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- 적용 후: 백엔드 프로세스 종료 후 `npx prisma generate` 권장
