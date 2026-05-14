function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

/** 트로피 프로젝트: 제목·설명만 (작성자 닉네임 제외) */
export function projectTitleOrDescriptionMatchesQuery(row, q) {
  const needle = norm(q);
  if (!needle) return true;
  const title = norm(row?.title ?? row?.name ?? '');
  const desc = norm(row?.description ?? row?.desc ?? '');
  return title.includes(needle) || desc.includes(needle);
}

/** 게시글: 본문·해시태그만 (작성자 제외). snippet·user.nickname은 검색 매칭에 쓰지 않음 */
export function postContentOrHashtagMatchesQuery(dto, q) {
  const needle = norm(q);
  if (!needle) return true;

  if (norm(dto?.content ?? '').includes(needle)) return true;

  const tags = Array.isArray(dto?.hashtags) ? dto.hashtags : [];
  const tagMatch = tags.some((h) => {
    const name = typeof h === 'string' ? h : String(h?.name ?? '');
    return norm(name).includes(needle);
  });
  if (tagMatch) return true;

  const authorNick = norm(
    dto?.author_nickname ?? dto?.authorNickname ?? dto?.user?.nickname ?? '',
  );
  if (authorNick && authorNick.includes(needle)) return false;

  return false;
}

/**
 * 유저 검색 자동완성: API가 로그인 본인을 제외하는 경우,
 * 닉네임이 검색어에 맞으면 목록 맨 앞에 본인 한 명만 합침.
 */
export function mergeMeIntoUserSearchIfMatch(users, q, me) {
  const list = Array.isArray(users) ? users : [];
  if (!me?.user_id) return list;
  const needle = norm(q);
  if (!needle) return list;
  const uid = Number(me.user_id);
  if (list.some((u) => Number(u.user_id ?? u.id) === uid)) return list;
  const nick = norm(me.nickname || me.username || me.name || '');
  if (!nick.includes(needle)) return list;
  return [
    {
      user_id: me.user_id,
      nickname: me.nickname || me.username || me.name || `user-${me.user_id}`,
      avatar_url: me.avatar_url ?? null,
    },
    ...list,
  ];
}
