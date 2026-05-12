# F01 — 피드 플로우차트 (`F01Feed.md` 기반)

아래 다이어그램은 **Mermaid** 문법이다. GitHub·일부 에디터에서 미리보기 가능.

---

## 1. 게시글 작성 흐름

이미지 업로드(선택) → 해시태그 upsert → `posts` 저장 → 연관 테이블 반영.

```mermaid
flowchart TD
  A[클라이언트: POST /api/feed] --> B{JWT 인증}
  B -->|실패| E401[401 UNAUTHORIZED]
  B -->|성공| C[본문·type·hashtags·image_urls 검증]
  C -->|실패| E400[400 VALIDATION_ERROR]
  C -->|성공| D{image_urls 있음?}
  D -->|예| F[각 URL: 확장자·MIME·5MB 규칙 검사]
  F -->|실패| EIMG[400 INVALID_IMAGE]
  F -->|성공| G[트랜잭션 시작]
  D -->|아니오| G
  G --> H[Post 행 INSERT]
  H --> I{hashtags 있음?}
  I -->|예| J[Hashtag UPSERT + PostHashtag 연결]
  I -->|아니오| K{image_urls 있음?}
  J --> K
  K -->|예| L[PostImage 행들 INSERT]
  K -->|아니오| M[커밋]
  L --> M
  M --> N[201 + post DTO]
```

---

## 2. 피드 조회 흐름 (커서 페이지네이션)

`last_post_id`로 앵커 → `(created_at, post_id)` 기준 이전 페이지.

```mermaid
flowchart TD
  A[클라이언트: GET /api/feed 등] --> B[Query: limit, last_post_id]
  B --> C{last_post_id 존재?}
  C -->|예| D[해당 Post 조회로 앵커 생성]
  D -->|없음/삭제됨| E400[400 INVALID_CURSOR]
  C -->|아니오| F[앵커 없음 = 첫 페이지]
  D -->|성공| G[WHERE 차단·비공개·삭제 필터]
  F --> G
  G --> H["ORDER BY created_at DESC, post_id DESC"]
  H --> I[LIMIT limit+1]
  I --> J{결과 개수 > limit?}
  J -->|예| K[has_more=true, next_cursor=마지막 post_id]
  J -->|아니오| L[has_more=false, next_cursor=null]
  K --> M[200 + items]
  L --> M
```

---

## 3. 좋아요 토글 흐름

```mermaid
flowchart TD
  A[클라이언트: POST /api/feed/:postId/like] --> B{JWT 인증}
  B -->|실패| E401[401]
  B -->|성공| C{Post 존재·삭제 아님?}
  C -->|아니오| E404[404 POST_NOT_FOUND]
  C -->|예| D{이미 좋아요 행 존재?}
  D -->|예| E[DELETE PostLike + like_count--]
  D -->|아니오| F[INSERT PostLike + like_count++]
  E --> G[liked=false]
  F --> H[liked=true]
  G --> I[200 + liked + like_count]
  H --> I
```

---

## 4. 검색 흐름 (자동완성 → 결과 탭 분기)

```mermaid
flowchart TD
  A[사용자 입력 q] --> B{엔터/검색 실행?}
  B -->|아니오| C[GET /api/search/autocomplete?q]
  C --> D[혼합 제안 목록 표시]
  D --> A
  B -->|예| E{type 선택: user | post}
  E --> F[GET /api/search?q&type&cursor&limit]
  F --> G{type == post}
  F --> H{type == user}
  G --> I[게시글 커서: last_post_id]
  H --> J[유저 커서: last_user_id]
  I --> K[탭: 게시글 결과]
  J --> L[탭: 유저 결과]
```

---

## 참고

- 실제 URL은 항상 **`/api` 접두사**를 붙인다 (`F01Feed.md` 1.1절).
