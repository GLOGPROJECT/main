# F01 — 피드 & 검색 API 사양

> 구현 범위: `glog_backend` Express + Prisma(MySQL).  
> 모든 비인증 경로는 **공개 데이터만** 반환하고, 민감 정보는 비즈니스 규칙에 따름.

## 1. 공통

### 1.1 Base path

- API는 **`/api`** 아래에 마운트된다. (`app.js`의 `app.use('/api', …)`)
- 본 문서의 경로는 **`/api` 제외 상대 경로**로 표기한다.  
  예: 문서의 `GET /feed` → 실제 URL은 **`GET /api/feed`**

### 1.2 인증

- **Bearer JWT** (`Authorization: Bearer <access_token>`)  
- 기존 `src/auth/middleware.js`의 `authenticate`와 동일한 방식.

| 구분 | 설명 |
|------|------|
| **공개** | 토큰 없이 호출 가능 (응답은 비공개·차단 규칙 적용) |
| **필수** | 토큰 없으면 `401` |

### 1.3 에러 응답 형식

모든 실패 응답(4xx/5xx)은 아래 JSON을 따른다.

```json
{
  "error": "사람이 읽을 수 있는 메시지",
  "code": "MACHINE_READABLE_CODE"
}
```

- `code`: 대문자 스네이크 또는 `UPPER_SNAKE` (팀 규칙에 맞춰 통일)

### 1.4 성공 시 공통 필드 (목록 계열)

- `items`: 배열  
- `next_cursor`: 다음 페이지가 있으면 문자열, 없으면 `null`  
- `has_more`: boolean  

(필요 시 `limit` 기본값 예: `20`, 최대 `50`)

---

## 2. 기능 목록 및 URL 구조

| # | 설명 | Method | Path | 인증 |
|---|------|--------|------|------|
| 1 | 전체 피드 조회 | GET | `/feed` | 공개 |
| 2 | 팔로우 피드 조회 | GET | `/feed/following` | 필수 |
| 3 | 해시태그 피드 조회 | GET | `/tag/:tagname` | 공개 |
| 4 | 유저 프로필 피드 조회 | GET | `/feed/user/:userId` | 공개 |
| 5 | 게시글 작성 | POST | `/feed` | 필수 |
| 6 | 게시글 수정 | PATCH | `/feed/:postId` | 필수 |
| 7 | 게시글 삭제 | DELETE | `/feed/:postId` | 필수 |
| 8 | 좋아요 토글 | POST | `/feed/:postId/like` | 필수 |
| 9 | 댓글 목록 조회 | GET | `/feed/:postId/comments` | 공개 |
| 10 | 댓글 작성 | POST | `/feed/:postId/comments` | 필수 |
| 11 | 댓글 삭제 | DELETE | `/comments/:commentId` | 필수 |
| 12 | 해시태그 자동완성 | GET | `/hashtags/autocomplete` | 공개 |
| 13 | 통합 검색 | GET | `/search` | 공개 |
| 14 | 검색 자동완성 | GET | `/search/autocomplete` | 공개 |
| 15 | 인기 해시태그 | GET | `/hashtags/popular` | 공개 |

---

## 3. 커서 페이지네이션

### 3.1 원칙

- **정렬**: `created_at DESC`, 동일 시각이면 **`post_id DESC`** 로 tie-break (안정적 순서).
- **커서**: 클라이언트는 **`last_post_id`** 하나만 보낸다.
- 서버는 해당 `post_id`의 `(created_at, post_id)` 를 조회한 뒤, 그보다 **이전** 글만 가져온다.

### 3.2 쿼리 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `limit` | int | N | 기본 `20`, 최대 `50` |
| `last_post_id` | int | N | 없으면 첫 페이지 |

### 3.3 동작 (의사코드)

```
다음 페이지:
WHERE (created_at, post_id) < (anchor.created_at, anchor.post_id)
ORDER BY created_at DESC, post_id DESC
LIMIT limit + 1  -- has_more 판별용 +1
```

- `last_post_id`가 존재하지 않거나 삭제된 글이면: **`400`** + `code: INVALID_CURSOR` (또는 무시하고 첫 페이지로 처리 — 구현 시 한 가지로 통일)

### 3.4 검색 API의 커서

- `GET /search`는 `type`에 따라 커서 의미가 다를 수 있음.
  - `type=post`: `last_post_id` (문서와 동일 규칙)
  - `type=user`: `last_user_id` (별도 파라미터로 명시 권장)

본 문서에서는 **`GET /search`에 한해** `last_user_id` 옵션을 둘 수 있다고만 명시한다.

---

## 4. 이미지 업로드 제한

| 항목 | 규칙 |
|------|------|
| 최대 용량 | **파일당 5MB** |
| 허용 MIME / 확장자 | **jpg, jpeg, png, gif, webp** |
| 개수 상한 | 구현 단계에서 정함 (예: 글당 최대 10장) — 스키마 `PostImage`와 일치 |

- 형식 불일치 / 용량 초과: **`400`** `code: INVALID_IMAGE`

---

## 5. 비즈니스 규칙

### 5.1 차단(Block)

- 조회자 A가 B를 차단한 경우: **B가 작성한 글·댓글은 A에게 노출하지 않음** (팔로우 피드, 전체 피드, 검색, 타 유저 피드 등 동일).
- 역방향 차단도 동일하게 적용할지는 정책 선택 — 기본안: **양방향 중 한쪽이라도 차단이면 상대 콘텐츠 제외**.

### 5.2 비공개 유저 (`User.is_private`)

- **목록/검색/타인 피드**: 닉네임 + 아바타만 노출 (이메일, bio, 국가 등 제외).
- **본인 조회** 또는 **인증된 본인의 팔로우 관계가 허용된 경우**에만 프로필 확장 필드 노출 가능 (선택 정책).

### 5.3 삭제된 글

- **목록 API**: `is_deleted = true` 인 글은 **제외**.
- **단건 조회**(향후 `GET /feed/:postId` 도입 시 포함): 삭제된 글은 **`404`** + `code: POST_NOT_FOUND`.

### 5.4 게시글 삭제와 댓글(Cascade)

- **소프트 삭제** 권장: `Post.is_deleted = true`, `deleted_at` 설정.
- 댓글: 목록에서는 **`Comment.is_deleted = false`** 만 노출. 글이 삭제되면 댓글 목록 API는 **`404`** (글 자체가 없음) 또는 빈 목록 정책 중 하나로 통일 — **권장: `404`**.

### 5.5 해시태그 URL (`:tagname`)

- 경로 디코딩 후 **소문자 정규화** 권장.
- 공백/특수문자는 URL 인코딩 필수.

### 5.6 좋아요

- **멱등 토글**: 같은 사용자가 연속 호출 시 좋아요 on/off.
- 응답에 **`liked: boolean`**, **`like_count: number`** 포함 권장.

### 5.7 댓글 삭제 권한

- **댓글 작성자 본인** 또는 **원글 작성자**만 삭제 가능 (정책 확정 후 구현).

---

## 6. API별 Request / Response

공통: 성공 시 주로 **`200`**, 생성 시 **`201`**. 본문은 JSON.

### 6.1 `GET /feed`

**Query:** `limit`, `last_post_id`  
**성공 `200`:** `{ items, next_cursor, has_more }` — `items[]` 에 게시글 DTO  
**실패:** `400` 잘못된 커서

---

### 6.2 `GET /feed/following`

**인증:** 필수  
**Query:** `limit`, `last_post_id`  
**성공 `200`:** 팔로우한 유저의 글만, 차단·비공개 규칙 적용  
**실패:** `401`

---

### 6.3 `GET /tag/:tagname`

**Query:** `limit`, `last_post_id`  
**성공 `200`:** 해당 태그가 붙은 글 목록  
**실패:** `404` 태그 없음 (선택: 빈 목록 `200`으로 통일 가능)

---

### 6.4 `GET /feed/user/:userId`

**Query:** `limit`, `last_post_id`  
**성공 `200`:** 해당 유저의 공개 범위 내 글  
**실패:** `404` 유저 없음 또는 삭제된 유저

---

### 6.5 `POST /feed`

**Body (예시):**

```json
{
  "content": "본문",
  "type": "public | anonymous | secret",
  "image_urls": ["https://..."],
  "hashtags": ["react", "js"]
}
```

**성공 `201`:** `{ "post": { ... } }`  
**실패:** `400` 검증 실패, `401`, `413` 이미지 관련(프록시 사용 시)

---

### 6.6 `PATCH /feed/:postId`

**Body:** 수정 필드만 (content, image_urls, hashtags 등)  
**성공 `200`:** `{ "post": { ... } }`  
**실패:** `401`, `403` 본인 아님, `404` 글 없음/삭제됨

---

### 6.7 `DELETE /feed/:postId`

**성공 `204`** 또는 **`200`** + `{ "ok": true }`  
**실패:** `401`, `403`, `404`

---

### 6.8 `POST /feed/:postId/like`

**성공 `200`:** `{ "liked": true, "like_count": 12 }`  
**실패:** `401`, `404` 글 없음

---

### 6.9 `GET /feed/:postId/comments`

**Query:** `limit`, `cursor` (댓글용 — `last_comment_id` 권장, 본 문서에서는 `last_comment_id` 로 통일 가능)  
**성공 `200`:** `{ items, next_cursor, has_more }`  
**실패:** `404` 원글이 없거나 삭제됨

---

### 6.10 `POST /feed/:postId/comments`

**Body:** `{ "content": "댓글 내용" }`  
**성공 `201`:** `{ "comment": { ... } }`  
**실패:** `400`, `401`, `404`

---

### 6.11 `DELETE /comments/:commentId`

**성공 `204` 또는 `200`**  
**실패:** `401`, `403`, `404`

---

### 6.12 `GET /hashtags/autocomplete`

**Query:** `q` (필수, 최소 1자), `limit` (기본 10)  
**성공 `200`:** `{ "items": [ { "name": "react", "use_count": 120 } ] }`  
**실패:** `400` q 없음

---

### 6.13 `GET /search`

**Query:** `q`, `type` (`user` \| `post`), `limit`, `last_post_id` 또는 `last_user_id`  
**성공 `200`:** 타입별 결과 + 커서  
**실패:** `400` type 불일치

---

### 6.14 `GET /search/autocomplete`

**Query:** `q`  
**성공 `200`:** 유저/태그/제목 등 혼합 제안 배열 (구현 세부는 팀 합의)

---

### 6.15 `GET /hashtags/popular`

**Query:** `limit` (기본 20)  
**성공 `200`:** `{ "items": [ { "name": "...", "use_count": N } ] }`

---

## 7. 에러 코드 예시 (참고)

| HTTP | code | 용도 |
|------|------|------|
| 400 | VALIDATION_ERROR | 입력 검증 |
| 400 | INVALID_CURSOR | 커서 무효 |
| 400 | INVALID_IMAGE | 이미지 규칙 위반 |
| 401 | UNAUTHORIZED | 인증 필요 |
| 403 | FORBIDDEN | 권한 없음 |
| 404 | POST_NOT_FOUND | 글 없음/삭제됨 |
| 404 | USER_NOT_FOUND | 유저 없음 |
| 404 | COMMENT_NOT_FOUND | 댓글 없음 |

---

## 8. DB 스키마 참고 (Prisma)

- `Post`, `PostImage`, `PostLike`, `Comment`, `Hashtag`, `PostHashtag`
- `Follow`, `Block`, `User.is_private`, `User.is_deleted`
- 구현 시 마이그레이션과 함께 인덱스(`created_at`, `post_id`, 태그 조인 등) 검토

---

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| (초안) | F01 피드+검색 사양 문서화 |
