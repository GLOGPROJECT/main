-- Prisma 클라이언트가 아직 posts.link_* 를 SELECT 하는데 DB에 없을 때 500 방지용.
-- 이미 있으면 해당 줄만 건너뛰거나 에러 무시.
ALTER TABLE posts ADD COLUMN link_url VARCHAR(2048) NULL;
ALTER TABLE posts ADD COLUMN link_title VARCHAR(500) NULL;
ALTER TABLE posts ADD COLUMN link_description VARCHAR(500) NULL;
ALTER TABLE posts ADD COLUMN link_image_url VARCHAR(2048) NULL;
