# F01 — 피드 시퀀스 다이어그램 (`F01Feed.md` 기반)

클라이언트 → **Express 라우터** → **(서비스 레이어)** → **Prisma** → **MySQL** 순서로 표현한다.  
서비스 레이어는 선택이나, 복잡한 트랜잭션·정책은 서비스에 두는 것을 권장한다.

---

## 1. 게시글 작성 (이미지 URL + 해시태그)

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Express /api/feed
  participant S as FeedService
  participant P as Prisma
  participant DB as MySQL

  C->>R: POST /api/feed + Bearer JWT + JSON body
  R->>R: authenticate 미들웨어
  R->>S: createPost(dto, userId)
  S->>S: 검증 이미지 규칙·본문
  S->>P: $transaction
  P->>DB: INSERT posts
  P->>DB: UPSERT hashtags / INSERT post_hashtags
  P->>DB: INSERT post_images (선택)
  P-->>S: commit
  S-->>R: post DTO
  R-->>C: 201 JSON
```

---

## 2. 전체 피드 조회 (커서)

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Express /api/feed
  participant S as FeedService
  participant P as Prisma
  participant DB as MySQL

  C->>R: GET /api/feed?limit&last_post_id
  R->>S: listFeed(viewerId, cursor)
  opt last_post_id 있음
    S->>P: findUnique post (앵커)
    P->>DB: SELECT …
    P-->>S: anchor row
  end
  S->>P: findMany posts + 필터 차단·삭제
  P->>DB: SELECT … ORDER BY created_at DESC, post_id DESC LIMIT n+1
  P-->>S: rows
  S-->>R: items, next_cursor, has_more
  R-->>C: 200 JSON
```

---

## 3. 좋아요 토글

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Express /api/feed/:postId/like
  participant S as FeedService
  participant P as Prisma
  participant DB as MySQL

  C->>R: POST + Bearer JWT
  R->>R: authenticate
  R->>S: toggleLike(userId, postId)
  S->>P: findUnique PostLike (복합키)
  P->>DB: SELECT …
  alt 좋아요 있음
    S->>P: delete PostLike + decrement like_count
  else 없음
    S->>P: create PostLike + increment like_count
  end
  P->>DB: …
  P-->>S: 결과
  S-->>R: liked, like_count
  R-->>C: 200 JSON
```

---

## 4. 통합 검색 (type=post)

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Express /api/search
  participant S as SearchService
  participant P as Prisma
  participant DB as MySQL

  C->>R: GET /api/search?q&type=post&last_post_id&limit
  R->>S: searchPosts(q, cursor, limit, viewerId)
  S->>P: Raw 또는 findMany + WHERE fulltext/like 정책
  P->>DB: SELECT posts …
  P-->>S: rows
  S-->>R: items + 커서
  R-->>C: 200 JSON
```

---

## 5. 댓글 작성

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Express /api/feed/:postId/comments
  participant S as CommentService
  participant P as Prisma
  participant DB as MySQL

  C->>R: POST + JWT + { content }
  R->>R: authenticate
  R->>S: addComment(postId, userId, content)
  S->>P: findUnique Post (삭제 여부)
  P->>DB: SELECT …
  alt Post 없음/삭제
    S-->>R: throw 404
  else OK
    S->>P: create Comment + update post comment_count
    P->>DB: INSERT / UPDATE
    P-->>S: comment
  end
  S-->>R: DTO
  R-->>C: 201 JSON
```

---

## 참고

- 실패 시 응답 본문은 `F01Feed.md`의 **`{ error, code }`** 형식을 따른다.
