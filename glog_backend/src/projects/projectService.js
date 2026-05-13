const prisma = require('../config/db');

function timeAgoFromDate(d) {
  const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMin < 60) return `${diffMin}분 전`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}시간 전`;
  const days = Math.floor(h / 24);
  return `${days}일 전`;
}

function formatDateRange(start, end) {
  if (!start && !end) return '';
  const fmt = (dt) => {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  };
  const a = start ? fmt(start) : '';
  const b = end ? fmt(end) : '';
  if (a && b) return `${a} ~ ${b}`;
  return a || b || '';
}

function isValidHttpUrl(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {number} userId
 * @param {number|null} viewerId
 * @param {'latest'|'oldest'|'popular'} [sortMode='latest'] — latest: 등록일 내림차순, oldest: 등록일 오름차순, popular: 좋아요 수
 */
async function listUserProjectsWithTrophies(userId, viewerId, sortMode = 'latest') {
  let orderBy;
  if (sortMode === 'popular') {
    orderBy = [{ trophy: { like_count: 'desc' } }, { created_at: 'desc' }];
  } else {
    const dir = sortMode === 'oldest' ? 'asc' : 'desc';
    orderBy = { created_at: dir };
  }
  const rows = await prisma.project.findMany({
    where: { user_id: userId, is_deleted: false },
    orderBy,
    include: {
      project_tags: true,
      trophy: true,
      user: { select: { user_id: true, nickname: true, avatar_url: true } },
      contributors: {
        include: {
          user: { select: { user_id: true, nickname: true, avatar_url: true } },
        },
      },
    },
  });

  let likedTrophyIds = new Set();
  if (viewerId && rows.length) {
    const tids = rows.map((r) => r.trophy?.trophies_id).filter(Boolean);
    if (tids.length) {
      const likes = await prisma.trophyLike.findMany({
        where: { user_id: viewerId, trophy_id: { in: tids } },
        select: { trophy_id: true },
      });
      likedTrophyIds = new Set(likes.map((l) => l.trophy_id));
    }
  }

  return rows
    .filter((r) => r.trophy)
    .map((r) => ({
      project_id: r.projects_id,
      trophy_id: r.trophy.trophies_id,
      owner_user_id: r.user_id,
      author_nickname: r.user?.nickname ?? '',
      author_avatar_url: r.user?.avatar_url ?? null,
      title: r.title,
      description: r.description,
      github_url: r.github_url,
      deploy_url: r.deploy_url,
      image_url: r.image_url,
      video_url: r.video_url,
      techStacks: r.project_tags.map((t) => t.tag_name),
      dateRange: formatDateRange(r.start_date, r.end_date),
      start_date: r.start_date,
      end_date: r.end_date,
      timeAgo: timeAgoFromDate(new Date(r.created_at)),
      updated_at: r.updated_at,
      grade: r.trophy.grade,
      likes: r.trophy.like_count,
      liked_by_me: likedTrophyIds.has(r.trophy.trophies_id),
      comments: 0,
      contributors: (r.contributors || []).map((c) => ({
        user_id: c.user_id,
        nickname: c.user?.nickname ?? '',
        avatar_url: c.user?.avatar_url ?? null,
      })),
    }));
}

/**
 * 전체 유저의 프로젝트·트로피 목록 (트로피 탭 공용 피드)
 * @param {number|null} viewerId
 * @param {'latest'|'oldest'|'popular'} [sortMode='latest']
 */
async function listCommunityProjectsWithTrophies(viewerId, sortMode = 'latest') {
  let orderBy;
  if (sortMode === 'popular') {
    orderBy = [{ trophy: { like_count: 'desc' } }, { created_at: 'desc' }];
  } else {
    const dir = sortMode === 'oldest' ? 'asc' : 'desc';
    orderBy = { created_at: dir };
  }
  const rows = await prisma.project.findMany({
    where: { is_deleted: false, trophy: { isNot: null } },
    orderBy,
    include: {
      project_tags: true,
      trophy: true,
      user: { select: { user_id: true, nickname: true, avatar_url: true } },
      contributors: {
        include: {
          user: { select: { user_id: true, nickname: true, avatar_url: true } },
        },
      },
    },
  });

  const withTrophy = rows.filter((r) => r.trophy);

  let likedTrophyIds = new Set();
  if (viewerId && withTrophy.length) {
    const tids = withTrophy.map((r) => r.trophy.trophies_id).filter(Boolean);
    if (tids.length) {
      const likes = await prisma.trophyLike.findMany({
        where: { user_id: viewerId, trophy_id: { in: tids } },
        select: { trophy_id: true },
      });
      likedTrophyIds = new Set(likes.map((l) => l.trophy_id));
    }
  }

  return withTrophy.map((r) => ({
    project_id: r.projects_id,
    trophy_id: r.trophy.trophies_id,
    owner_user_id: r.user_id,
    author_nickname: r.user?.nickname ?? '',
    author_avatar_url: r.user?.avatar_url ?? null,
    title: r.title,
    description: r.description,
    github_url: r.github_url,
    deploy_url: r.deploy_url,
    image_url: r.image_url,
    video_url: r.video_url,
    techStacks: r.project_tags.map((t) => t.tag_name),
    dateRange: formatDateRange(r.start_date, r.end_date),
    start_date: r.start_date,
    end_date: r.end_date,
    timeAgo: timeAgoFromDate(new Date(r.created_at)),
    updated_at: r.updated_at,
    grade: r.trophy.grade,
    likes: r.trophy.like_count,
    liked_by_me: likedTrophyIds.has(r.trophy.trophies_id),
    comments: 0,
    contributors: (r.contributors || []).map((c) => ({
      user_id: c.user_id,
      nickname: c.user?.nickname ?? '',
      avatar_url: c.user?.avatar_url ?? null,
    })),
  }));
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * @param {number} userId
 * @param {{ title: string, description: string, github_url?: string|null, deploy_url?: string|null, image_url?: string|null, video_url?: string|null, start_date?: string|null, end_date?: string|null, tags?: string[], contributor_user_ids?: number[] }} payload
 */
async function createProject(userId, payload) {
  const title = String(payload.title || '').trim().slice(0, 30);
  const description = String(payload.description || '').trim().slice(0, 500);
  const github_url = payload.github_url ? String(payload.github_url).trim().slice(0, 500) : null;
  const deploy_url = payload.deploy_url ? String(payload.deploy_url).trim().slice(0, 500) : null;

  if (!title) return { ok: false, code: 'validation', message: '제목을 입력해주세요.' };
  if (!description) return { ok: false, code: 'validation', message: '설명을 입력해주세요.' };
  if (!github_url && !deploy_url) {
    return { ok: false, code: 'validation', message: 'GitHub URL 또는 배포 URL 중 하나는 필수입니다.' };
  }
  if (github_url && !isValidHttpUrl(github_url)) {
    return { ok: false, code: 'validation', message: '유효하지 않은 URL이에요' };
  }
  if (deploy_url && !isValidHttpUrl(deploy_url)) {
    return { ok: false, code: 'validation', message: '유효하지 않은 URL이에요' };
  }

  const since = startOfUtcDay();
  const todayCount = await prisma.project.count({
    where: { user_id: userId, is_deleted: false, created_at: { gte: since } },
  });
  if (todayCount >= 3) {
    return { ok: false, code: 'limit', message: '오늘 등록 가능한 프로젝트 수를 초과했어요' };
  }

  if (github_url) {
    const dup = await prisma.project.findFirst({
      where: { is_deleted: false, github_url },
    });
    if (dup) return { ok: false, code: 'duplicate', message: '이미 등록된 프로젝트예요' };
  }
  if (deploy_url) {
    const dupD = await prisma.project.findFirst({
      where: { is_deleted: false, deploy_url },
    });
    if (dupD) return { ok: false, code: 'duplicate', message: '이미 등록된 프로젝트예요' };
  }

  const tags = Array.isArray(payload.tags)
    ? [...new Set(payload.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10)
    : [];

  const image_url = payload.image_url ? String(payload.image_url).trim().slice(0, 500) : null;
  const video_url = payload.video_url ? String(payload.video_url).trim().slice(0, 500) : null;

  let start_date = null;
  let end_date = null;
  if (payload.start_date) {
    const d = new Date(payload.start_date);
    if (!Number.isNaN(d.getTime())) start_date = d;
  }
  if (payload.end_date) {
    const d = new Date(payload.end_date);
    if (!Number.isNaN(d.getTime())) end_date = d;
  }

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        user_id: userId,
        title,
        description,
        github_url,
        deploy_url,
        image_url: image_url || null,
        video_url: video_url || null,
        start_date,
        end_date,
      },
    });
    if (tags.length) {
      await tx.projectTag.createMany({
        data: tags.map((tag_name) => ({ project_id: project.projects_id, tag_name })),
      });
    }

    const contribRaw = Array.isArray(payload.contributor_user_ids) ? payload.contributor_user_ids : [];
    const contribIds = [
      ...new Set(
        contribRaw
          .map((x) => parseInt(x, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== userId),
      ),
    ].slice(0, 30);
    if (contribIds.length) {
      const validUsers = await tx.user.findMany({
        where: { user_id: { in: contribIds }, is_deleted: false },
        select: { user_id: true },
      });
      const allowed = new Set(validUsers.map((u) => u.user_id));
      const rows = contribIds.filter((id) => allowed.has(id)).map((uid) => ({
        project_id: project.projects_id,
        user_id: uid,
      }));
      if (rows.length) {
        await tx.projectContributor.createMany({ data: rows, skipDuplicates: true });
      }
    }

    const trophy = await tx.trophy.create({
      data: {
        project_id: project.projects_id,
        user_id: userId,
        grade: 'bronze',
        like_count: 0,
      },
    });
    return { project, trophy };
  });

  return { ok: true, project_id: created.project.projects_id, trophy_id: created.trophy.trophies_id };
}

/**
 * 본인 프로젝트 수정 — 트로피 등급·좋아요 수는 변경하지 않음
 * @param {number} ownerUserId
 * @param {number} projectId
 * @param {{ title: string, description: string, github_url?: string|null, deploy_url?: string|null, image_url?: string|null, video_url?: string|null, start_date?: string|null, end_date?: string|null, tags?: string[], contributor_user_ids?: number[] }} payload
 */
async function updateProject(ownerUserId, projectId, payload) {
  const existing = await prisma.project.findFirst({
    where: { projects_id: projectId, user_id: ownerUserId, is_deleted: false },
    include: { trophy: true },
  });
  if (!existing) {
    return { ok: false, code: 'not_found', message: '프로젝트를 찾을 수 없어요' };
  }

  const title = String(payload.title || '').trim().slice(0, 30);
  const description = String(payload.description || '').trim().slice(0, 500);
  const github_url = payload.github_url ? String(payload.github_url).trim().slice(0, 500) : null;
  const deploy_url = payload.deploy_url ? String(payload.deploy_url).trim().slice(0, 500) : null;

  if (!title || !description) {
    return { ok: false, code: 'validation', message: '필수 항목을 입력해주세요' };
  }
  if (!github_url && !deploy_url) {
    return { ok: false, code: 'validation', message: '필수 항목을 입력해주세요' };
  }
  if (github_url && !isValidHttpUrl(github_url)) {
    return { ok: false, code: 'validation', message: '유효하지 않은 URL이에요' };
  }
  if (deploy_url && !isValidHttpUrl(deploy_url)) {
    return { ok: false, code: 'validation', message: '유효하지 않은 URL이에요' };
  }

  if (github_url) {
    const dup = await prisma.project.findFirst({
      where: {
        is_deleted: false,
        github_url,
        NOT: { projects_id: projectId },
      },
    });
    if (dup) return { ok: false, code: 'duplicate', message: '이미 등록된 프로젝트예요' };
  }
  if (deploy_url) {
    const dupD = await prisma.project.findFirst({
      where: {
        is_deleted: false,
        deploy_url,
        NOT: { projects_id: projectId },
      },
    });
    if (dupD) return { ok: false, code: 'duplicate', message: '이미 등록된 프로젝트예요' };
  }

  const tags = Array.isArray(payload.tags)
    ? [...new Set(payload.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10)
    : [];

  const image_url = payload.image_url ? String(payload.image_url).trim().slice(0, 500) : null;
  const video_url = payload.video_url ? String(payload.video_url).trim().slice(0, 500) : null;

  let start_date = null;
  let end_date = null;
  if (payload.start_date) {
    const d = new Date(payload.start_date);
    if (!Number.isNaN(d.getTime())) start_date = d;
  }
  if (payload.end_date) {
    const d = new Date(payload.end_date);
    if (!Number.isNaN(d.getTime())) end_date = d;
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { projects_id: projectId },
      data: {
        title,
        description,
        github_url,
        deploy_url,
        image_url: image_url || null,
        video_url: video_url || null,
        start_date,
        end_date,
      },
    });
    await tx.projectTag.deleteMany({ where: { project_id: projectId } });
    if (tags.length) {
      await tx.projectTag.createMany({
        data: tags.map((tag_name) => ({ project_id: projectId, tag_name })),
      });
    }

    await tx.projectContributor.deleteMany({ where: { project_id: projectId } });
    const contribRaw = Array.isArray(payload.contributor_user_ids) ? payload.contributor_user_ids : [];
    const contribIds = [
      ...new Set(
        contribRaw
          .map((x) => parseInt(x, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== ownerUserId),
      ),
    ].slice(0, 30);
    if (contribIds.length) {
      const validUsers = await tx.user.findMany({
        where: { user_id: { in: contribIds }, is_deleted: false },
        select: { user_id: true },
      });
      const allowed = new Set(validUsers.map((u) => u.user_id));
      const rows = contribIds.filter((id) => allowed.has(id)).map((uid) => ({
        project_id: projectId,
        user_id: uid,
      }));
      if (rows.length) {
        await tx.projectContributor.createMany({ data: rows, skipDuplicates: true });
      }
    }
  });

  return { ok: true };
}

/**
 * 본인 프로젝트 영구 삭제 — 트로피·좋아요·태그·기여자 포함
 * @param {number} ownerUserId
 * @param {number} projectId
 */
async function deleteProject(ownerUserId, projectId) {
  const existing = await prisma.project.findFirst({
    where: { projects_id: projectId, user_id: ownerUserId, is_deleted: false },
    include: { trophy: true },
  });
  if (!existing) {
    return { ok: false, code: 'not_found', message: '프로젝트를 찾을 수 없어요' };
  }

  const trophyId = existing.trophy?.trophies_id;

  await prisma.$transaction(async (tx) => {
    if (trophyId) {
      await tx.trophyLike.deleteMany({ where: { trophy_id: trophyId } });
      await tx.trophy.delete({ where: { trophies_id: trophyId } });
    }
    await tx.projectContributor.deleteMany({ where: { project_id: projectId } });
    await tx.projectTag.deleteMany({ where: { project_id: projectId } });
    await tx.project.delete({ where: { projects_id: projectId } });
  });

  return { ok: true };
}

/**
 * @param {number} viewerId
 * @param {number} trophyId
 */
async function toggleTrophyLike(viewerId, trophyId) {
  const trophy = await prisma.trophy.findUnique({
    where: { trophies_id: trophyId },
    include: { project: { select: { user_id: true, is_deleted: true } } },
  });
  if (!trophy || trophy.project.is_deleted) {
    return { ok: false, code: 'not_found', message: '트로피를 찾을 수 없습니다.' };
  }

  const existing = await prisma.trophyLike.findUnique({
    where: { user_id_trophy_id: { user_id: viewerId, trophy_id: trophyId } },
  });

  if (existing) {
    const nextCount = Math.max(0, trophy.like_count - 1);
    await prisma.$transaction(async (tx) => {
      await tx.trophyLike.delete({
        where: { user_id_trophy_id: { user_id: viewerId, trophy_id: trophyId } },
      });
      await tx.trophy.update({
        where: { trophies_id: trophyId },
        data: { like_count: nextCount },
      });
    });
    return { ok: true, liked: false, like_count: nextCount };
  }

  await prisma.$transaction([
    prisma.trophyLike.create({
      data: { user_id: viewerId, trophy_id: trophyId },
    }),
    prisma.trophy.update({
      where: { trophies_id: trophyId },
      data: { like_count: { increment: 1 } },
    }),
  ]);
  return { ok: true, liked: true, like_count: trophy.like_count + 1 };
}

/** 오늘(UTC 자정 기준) 등록한 프로젝트 개수 — 하루 3건 한도 표시용 */
async function countTodayProjectsForUser(userId) {
  const since = startOfUtcDay();
  return prisma.project.count({
    where: { user_id: userId, is_deleted: false, created_at: { gte: since } },
  });
}

module.exports = {
  listUserProjectsWithTrophies,
  listCommunityProjectsWithTrophies,
  createProject,
  updateProject,
  deleteProject,
  toggleTrophyLike,
  isValidHttpUrl,
  countTodayProjectsForUser,
};
