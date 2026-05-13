-- projects 테이블에 Prisma 스키마와 동일한 컬럼 추가 (로컬 DB가 구버전일 때)
-- 이미 있으면 해당 블록은 건너뜀

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
