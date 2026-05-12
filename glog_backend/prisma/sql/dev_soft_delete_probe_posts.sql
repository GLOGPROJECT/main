-- 개발용: 프로브/테스트로 넣은 짧은 본문 글을 피드에서 제외 (is_deleted = true)
-- Workbench에서 glogdb 선택 후 실행. 필요 시 content 조건만 수정하세요.

SET NAMES utf8mb4;

UPDATE posts
SET is_deleted = TRUE, deleted_at = NOW()
WHERE is_deleted = FALSE
  AND TRIM(content) IN ('svc-test', 'svc-tes', 'probe', '테스트', 'test2');
