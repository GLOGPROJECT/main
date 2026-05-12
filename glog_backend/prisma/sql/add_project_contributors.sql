-- 프로젝트 기여자(등록 회원) N:N — 적용 후 `npx prisma generate`
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
