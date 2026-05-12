import { useCallback, useEffect, useRef, useState } from 'react';
import api, { API_ORIGIN } from '../../api/axios';

const TITLE_MAX = 30;
const DESC_MAX = 500;
const CONTRIB_MAX = 12;
const TAG_MAX = 10;

function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
  return path;
}

function normalizeTagName(raw) {
  let s = String(raw ?? '')
    .trim()
    .replace(/^#+/g, '')
    .trim()
    .toLowerCase();
  if (s.length > 100) s = s.slice(0, 100);
  return s;
}

/** `image_url`에 쉼표·줄바꿈·| 로 여러 경로 저장 */
function parseProjectImagePaths(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
  }
  return s.split(/[,|\n]+/).map((x) => x.trim()).filter(Boolean);
}

const COVER_IMAGE_MAX = 8;
const IMAGE_URL_FIELD_MAX = 500;

/**
 * 프로젝트 등록(Post) / 수정(Patch) — GitHub 또는 배포 URL 필수, 기여자·태그 자동완성
 * @param {'create'|'edit'} [mode]
 * @param {null|{ project_id: number, title: string, description: string, github_url?: string, deploy_url?: string, video_url?: string, image_url?: string, tags?: string[], contributors?: { user_id: number, nickname?: string, avatar_url?: string|null }[], start_date?: string, end_date?: string }} [initialDraft]
 */
export default function ProjectRegisterModal({ open, onClose, onSuccess, mode = 'create', initialDraft = null }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imagePaths, setImagePaths] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [tagHits, setTagHits] = useState([]);
  const [tagPopular, setTagPopular] = useState([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [contributorQuery, setContributorQuery] = useState('');
  const [contributorHits, setContributorHits] = useState([]);
  const [contributorLoading, setContributorLoading] = useState(false);
  const [contributors, setContributors] = useState([]);
  const [todayReg, setTodayReg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const tagBlurTimer = useRef(null);
  const contribBlurTimer = useRef(null);
  const [contribMenuOpen, setContribMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setGithubUrl('');
      setDeployUrl('');
      setVideoUrl('');
      setImagePaths([]);
      setTagList([]);
      setTagDraft('');
      setTagHits([]);
      setTagPopular([]);
      setTagMenuOpen(false);
      setStartDate('');
      setEndDate('');
      setContributorQuery('');
      setContributorHits([]);
      setContributors([]);
      setTodayReg(null);
      setError(null);
      setDragOver(false);
      setContribMenuOpen(false);
      return;
    }

    if (mode === 'edit' && initialDraft != null && initialDraft.project_id != null) {
      setTitle(String(initialDraft.title ?? '').trim().slice(0, TITLE_MAX));
      setDescription(String(initialDraft.description ?? '').trim().slice(0, DESC_MAX));
      setGithubUrl(initialDraft.github_url != null ? String(initialDraft.github_url) : '');
      setDeployUrl(initialDraft.deploy_url != null ? String(initialDraft.deploy_url) : '');
      setVideoUrl(initialDraft.video_url != null ? String(initialDraft.video_url) : '');
      setImagePaths(parseProjectImagePaths(initialDraft.image_url));
      setTagList(Array.isArray(initialDraft.tags) ? initialDraft.tags.map((t) => String(t)) : []);
      setTagDraft('');
      setTagHits([]);
      setTagMenuOpen(false);
      setStartDate(
        initialDraft.start_date != null && String(initialDraft.start_date).length >= 10
          ? String(initialDraft.start_date).slice(0, 10)
          : '',
      );
      setEndDate(
        initialDraft.end_date != null && String(initialDraft.end_date).length >= 10
          ? String(initialDraft.end_date).slice(0, 10)
          : '',
      );
      setContributorQuery('');
      setContributorHits([]);
      setContributors(
        Array.isArray(initialDraft.contributors)
          ? initialDraft.contributors.map((c) => ({
              user_id: c.user_id,
              nickname: String(c.nickname ?? ''),
              avatar_url: c.avatar_url ?? null,
            }))
          : [],
      );
      setError(null);
      setDragOver(false);
      setContribMenuOpen(false);
      return;
    }

    setTitle('');
    setDescription('');
    setGithubUrl('');
    setDeployUrl('');
    setVideoUrl('');
    setImagePaths([]);
    setTagList([]);
    setTagDraft('');
    setTagHits([]);
    setTagPopular([]);
    setTagMenuOpen(false);
    setStartDate('');
    setEndDate('');
    setContributorQuery('');
    setContributorHits([]);
    setContributors([]);
    setError(null);
    setDragOver(false);
    setContribMenuOpen(false);
  }, [open, mode, initialDraft]);

  useEffect(() => {
    if (!open || mode === 'edit') return;
    let alive = true;
    api
      .get('/projects/me/today-count')
      .then(({ data }) => {
        if (!alive) return;
        setTodayReg({
          count: Number(data?.count ?? 0),
          max: Number(data?.max ?? 3),
          remaining: Number(data?.remaining ?? 3),
        });
      })
      .catch(() => {
        if (!alive) return;
        setTodayReg({ count: 0, max: 3, remaining: 3 });
      });
    return () => {
      alive = false;
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .get('/hashtags/popular?limit=8')
      .then(({ data }) => {
        if (!alive) return;
        setTagPopular(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!alive) return;
        setTagPopular([]);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !tagMenuOpen) return;
    const q = normalizeTagName(tagDraft);
    if (!q) {
      setTagHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/hashtags/autocomplete', { params: { q } });
        setTagHits(Array.isArray(data) ? data : []);
      } catch {
        setTagHits([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [tagDraft, open, tagMenuOpen]);

  useEffect(() => {
    if (!open || !contribMenuOpen) return;
    const q = contributorQuery.trim();
    if (q.length < 1) {
      setContributorHits([]);
      setContributorLoading(false);
      return;
    }
    setContributorLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        setContributorHits(Array.isArray(data?.users) ? data.users : []);
      } catch {
        setContributorHits([]);
      } finally {
        setContributorLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [contributorQuery, open, contribMenuOpen]);

  const uploadCoverFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || [])
      .filter((f) => f?.type?.startsWith('image/'))
      .slice(0, COVER_IMAGE_MAX);
    if (!files.length) return;
    setCoverUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('cover', file);
        const { data } = await api.post('/projects/upload-cover', fd);
        if (data?.image_url) {
          setImagePaths((prev) => {
            if (prev.length >= COVER_IMAGE_MAX) return prev;
            const next = [...prev, data.image_url];
            if (next.join(',').length > IMAGE_URL_FIELD_MAX) {
              setError('이미지 URL 합계가 500자를 넘을 수 없습니다.');
              return prev;
            }
            return next;
          });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || '이미지 업로드에 실패했습니다.');
    } finally {
      setCoverUploading(false);
    }
  }, []);

  const addContributor = useCallback((u) => {
    if (!u?.user_id) return;
    if (contributors.some((c) => c.user_id === u.user_id)) return;
    if (contributors.length >= CONTRIB_MAX) return;
    setContributors((prev) => [...prev, { user_id: u.user_id, nickname: u.nickname, avatar_url: u.avatar_url }]);
    setContributorQuery('');
    setContributorHits([]);
  }, [contributors]);

  const removeContributor = useCallback((userId) => {
    setContributors((prev) => prev.filter((c) => c.user_id !== userId));
  }, []);

  const addTagByName = useCallback((raw) => {
    const n = normalizeTagName(raw);
    if (!n) return;
    if (tagList.includes(n)) return;
    if (tagList.length >= TAG_MAX) return;
    setTagList((prev) => [...prev, n]);
    setTagDraft('');
    setTagHits([]);
  }, [tagList]);

  const removeTag = useCallback((name) => {
    setTagList((prev) => prev.filter((t) => t !== name));
  }, []);

  const openTagMenu = () => {
    if (tagBlurTimer.current) clearTimeout(tagBlurTimer.current);
    setTagMenuOpen(true);
  };

  const scheduleCloseTagMenu = () => {
    if (tagBlurTimer.current) clearTimeout(tagBlurTimer.current);
    tagBlurTimer.current = setTimeout(() => setTagMenuOpen(false), 180);
  };

  const openContribMenu = () => {
    if (contribBlurTimer.current) clearTimeout(contribBlurTimer.current);
    setContribMenuOpen(true);
  };

  const scheduleCloseContribMenu = () => {
    if (contribBlurTimer.current) clearTimeout(contribBlurTimer.current);
    contribBlurTimer.current = setTimeout(() => setContribMenuOpen(false), 180);
  };

  if (!open) return null;

  const limitReached = mode === 'create' && todayReg != null && todayReg.remaining <= 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'create' && limitReached) return;
    setError(null);
    try {
      setSubmitting(true);
      if (mode === 'edit' && initialDraft != null && initialDraft.project_id != null) {
        await api.patch(`/projects/${initialDraft.project_id}`, {
          title: title.trim(),
          description: description.trim(),
          github_url: githubUrl.trim() || null,
          deploy_url: deployUrl.trim() || null,
          image_url: imagePaths.length ? imagePaths.join(',').slice(0, IMAGE_URL_FIELD_MAX) : null,
          video_url: videoUrl.trim() || null,
          tags: tagList,
          start_date: startDate || null,
          end_date: endDate || null,
          contributor_user_ids: contributors.map((c) => c.user_id),
        });
      } else {
        await api.post('/projects', {
          title: title.trim(),
          description: description.trim(),
          github_url: githubUrl.trim() || null,
          deploy_url: deployUrl.trim() || null,
          image_url: imagePaths.length ? imagePaths.join(',').slice(0, IMAGE_URL_FIELD_MAX) : null,
          video_url: videoUrl.trim() || null,
          tags: tagList,
          start_date: startDate || null,
          end_date: endDate || null,
          contributor_user_ids: contributors.map((c) => c.user_id),
        });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (mode === 'edit' ? '수정에 실패했습니다.' : '등록에 실패했습니다.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showTagSuggest =
    tagMenuOpen && (tagHits.length > 0 || (normalizeTagName(tagDraft) === '' && tagPopular.length > 0));

  const showContribSuggest =
    contribMenuOpen && (contributorLoading || contributorHits.length > 0 || contributorQuery.trim().length > 0);

  const backdrop = {
    position: 'fixed',
    inset: 0,
    zIndex: 13000,
    background: 'rgba(15, 28, 54, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };
  const panel = {
    width: 'min(960px, 100%)',
    maxHeight: 'min(92vh, 900px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--feed-surface-elevated, #fff)',
    color: 'var(--feed-text, #0f172a)',
    borderRadius: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
    border: '1px solid var(--feed-border, #e2e8f0)',
  };
  const label = { display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 };
  const input = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 11px',
    borderRadius: 10,
    border: '1px solid var(--feed-border, #e2e8f0)',
    fontSize: '0.88rem',
    background: 'var(--feed-bg-page, #fff)',
    color: 'inherit',
  };

  const todayBadge =
    todayReg != null ? `오늘 등록 ${todayReg.count}/${todayReg.max}` : '오늘 등록 0/3';

  return (
    <div style={backdrop} role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="project-reg-title" style={panel} onClick={(ev) => ev.stopPropagation()}>
        <div style={{ flexShrink: 0, padding: '14px 18px 10px', borderBottom: '1px solid var(--feed-border, #e2e8f0)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <button
                type="button"
                onClick={onClose}
                aria-label="뒤로"
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  padding: 4,
                  color: 'var(--feed-muted, #64748b)',
                }}
              >
                ←
              </button>
              <div style={{ minWidth: 0 }}>
                <h2 id="project-reg-title" style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800 }}>
                  {mode === 'edit' ? '프로젝트 수정' : '프로젝트 등록'}
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: 'var(--feed-muted, #64748b)', lineHeight: 1.45 }}>
                  {mode === 'edit'
                    ? '수정해도 트로피 등급과 좋아요 수는 그대로 유지됩니다.'
                    : '프로젝트 정보를 입력한 뒤 등록하면 트로피가 함께 생성됩니다.'}
                </p>
              </div>
            </div>
            {mode === 'create' && (
            <span
              title="UTC 기준 오늘 등록한 프로젝트 수입니다. 하루 최대 3건입니다."
              style={{
                flexShrink: 0,
                fontSize: '0.72rem',
                fontWeight: 600,
                color: limitReached ? '#dc2626' : 'var(--feed-muted, #64748b)',
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${limitReached ? '#fecaca' : 'var(--feed-border, #e2e8f0)'}`,
                background: limitReached ? '#fef2f2' : 'var(--feed-bg-page, #f8fafc)',
              }}
            >
              {todayBadge}
            </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 18px',
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(200px,280px)',
              gap: 20,
              alignItems: 'start',
            }}
            className="project-reg-grid"
          >
            <style>{`
              @media (max-width: 720px) {
                .project-reg-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label style={{ ...label, marginBottom: 0 }}>프로젝트 제목 *</label>
                <span style={{ fontSize: '0.72rem', color: 'var(--feed-muted, #94a3b8)' }}>{title.length}/{TITLE_MAX}</span>
              </div>
              <input
                style={{ ...input, marginBottom: 14 }}
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                maxLength={TITLE_MAX}
                required
                placeholder="프로젝트 이름"
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label style={{ ...label, marginBottom: 0 }}>설명 *</label>
                <span style={{ fontSize: '0.72rem', color: 'var(--feed-muted, #94a3b8)' }}>{description.length}/{DESC_MAX}</span>
              </div>
              <textarea
                style={{ ...input, minHeight: 120, resize: 'vertical', marginBottom: 14 }}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                maxLength={DESC_MAX}
                required
                placeholder="프로젝트를 소개해 주세요 (Enter로 줄바꿈)"
              />

              <label style={label}>GitHub URL</label>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <span style={{ position: 'absolute', left: 11, top: 9, fontSize: '0.95rem', opacity: 0.55 }} aria-hidden>🔗</span>
                <input
                  style={{ ...input, paddingLeft: 34 }}
                  type="url"
                  placeholder="https://github.com/..."
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>

              <label style={label}>배포 URL</label>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <span style={{ position: 'absolute', left: 11, top: 9, fontSize: '0.95rem', opacity: 0.55 }} aria-hidden>🌐</span>
                <input
                  style={{ ...input, paddingLeft: 34 }}
                  type="url"
                  placeholder="https://..."
                  value={deployUrl}
                  onChange={(e) => setDeployUrl(e.target.value)}
                />
              </div>

              <label style={label}>기여자 ({contributors.length}/{CONTRIB_MAX})</label>
              <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: 'var(--feed-muted, #64748b)' }}>
                GitHub 로그인으로 가입된 회원 닉네임을 검색해 추가합니다. 본인은 목록에 나오지 않습니다.
              </p>
              <div
                style={{ position: 'relative', marginBottom: 10 }}
                onMouseDown={() => {
                  if (contribBlurTimer.current) clearTimeout(contribBlurTimer.current);
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    style={{ ...input, flex: 1, marginBottom: 0 }}
                    value={contributorQuery}
                    onChange={(e) => setContributorQuery(e.target.value)}
                    onFocus={openContribMenu}
                    onBlur={scheduleCloseContribMenu}
                    placeholder="닉네임 검색 (자동완성)"
                    autoComplete="off"
                  />
                  <span style={{ fontSize: '1.1rem', color: 'var(--feed-muted, #94a3b8)' }} aria-hidden>+</span>
                </div>
                {showContribSuggest && (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: '6px 0 0',
                      padding: 0,
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      zIndex: 4,
                      maxHeight: 220,
                      overflowY: 'auto',
                      borderRadius: 10,
                      border: '1px solid var(--feed-border, #e2e8f0)',
                      background: 'var(--feed-surface-elevated, #fff)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }}
                  >
                    {contributorLoading && contributorQuery.trim().length > 0 && (
                      <li className="feed-post-meta" style={{ padding: '10px 12px', fontSize: '0.82rem' }}>
                        검색 중…
                      </li>
                    )}
                    {!contributorLoading &&
                      contributorHits.length === 0 &&
                      contributorQuery.trim().length > 0 && (
                        <li className="feed-post-meta" style={{ padding: '10px 12px', fontSize: '0.82rem' }}>
                          검색 결과가 없습니다.
                        </li>
                      )}
                    {!contributorLoading &&
                      contributorHits.map((u) => (
                        <li key={u.user_id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addContributor(u)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              padding: '8px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: '0.86rem',
                            }}
                          >
                            {u.avatar_url ? (
                              <img src={resolveMediaUrl(u.avatar_url)} alt="" style={{ width: 28, height: 28, borderRadius: 999, objectFit: 'cover' }} />
                            ) : (
                              <span style={{ width: 28, height: 28, borderRadius: 999, background: '#e2e8f0' }} />
                            )}
                            <span>{u.nickname}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {contributors.map((c) => (
                  <span
                    key={c.user_id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--feed-bg-page, #eff6ff)',
                      border: '1px solid var(--feed-border, #bfdbfe)',
                      fontSize: '0.8rem',
                    }}
                  >
                    {c.nickname}
                    <button
                      type="button"
                      aria-label={`${c.nickname} 제거`}
                      onClick={() => removeContributor(c.user_id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: '0.95rem', lineHeight: 1, opacity: 0.6 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label style={label}>프로젝트 이미지 (선택)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  uploadCoverFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  uploadCoverFiles(e.dataTransfer.files);
                }}
                style={{
                  width: '100%',
                  minHeight: 140,
                  borderRadius: 12,
                  border: `2px dashed ${dragOver ? '#3b82f6' : 'var(--feed-border, #cbd5e1)'}`,
                  background: dragOver ? 'rgba(59,130,246,0.06)' : 'var(--feed-bg-page, #f8fafc)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 14,
                  color: 'var(--feed-muted, #64748b)',
                  fontSize: '0.82rem',
                }}
              >
                {coverUploading ? '업로드 중…' : (
                  <>
                    <span style={{ fontSize: '1.6rem' }} aria-hidden>
                      ⬆
                    </span>
                    <span>이미지 선택 또는 드래그 (여러 장, 최대 {COVER_IMAGE_MAX}장)</span>
                  </>
                )}
              </button>
              {imagePaths.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'flex-start' }}>
                  {imagePaths.map((p, idx) => (
                    <div
                      key={`${p}-${idx}`}
                      style={{
                        position: 'relative',
                        width: 100,
                        height: 76,
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: '1px solid var(--feed-border, #e2e8f0)',
                        flexShrink: 0,
                      }}
                    >
                      <img src={resolveMediaUrl(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        aria-label="이미지 제거"
                        onClick={() => setImagePaths((prev) => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: 'none',
                          background: 'rgba(15,23,42,0.65)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setImagePaths([])}
                    style={{ marginTop: 4, fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', alignSelf: 'center' }}
                  >
                    전체 제거
                  </button>
                </div>
              ) : null}

              <label style={label}>프로젝트 영상 (선택)</label>
              <input
                style={{ ...input, marginBottom: 14 }}
                type="url"
                placeholder="영상 URL (YouTube 등)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />

              <label style={label}>기술 태그 ({tagList.length}/{TAG_MAX})</label>
              <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: 'var(--feed-muted, #64748b)' }}>
                피드에 쓰인 해시태그를 검색해 선택하거나, 직접 입력 후 Enter로 추가합니다.
              </p>
              <div
                style={{ marginBottom: 10 }}
                onMouseDown={() => {
                  if (tagBlurTimer.current) clearTimeout(tagBlurTimer.current);
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {tagList.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      #{t}
                      <button type="button" aria-label={`${t} 제거`} onClick={() => removeTag(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1, opacity: 0.55 }}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  style={{ ...input, marginBottom: 0 }}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onFocus={openTagMenu}
                  onBlur={scheduleCloseTagMenu}
                  placeholder="태그 검색 또는 입력 후 Enter"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTagByName(tagDraft);
                    }
                  }}
                  disabled={tagList.length >= TAG_MAX}
                />
                {showTagSuggest && (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: '6px 0 0',
                      padding: 0,
                      maxHeight: 220,
                      overflowY: 'auto',
                      borderRadius: 10,
                      border: '1px solid var(--feed-border, #e2e8f0)',
                      background: 'var(--feed-surface-elevated, #fff)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }}
                  >
                    {normalizeTagName(tagDraft) === '' && tagPopular.length > 0 && (
                      <li className="feed-post-meta" style={{ padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>
                        추천 태그 (피드 인기)
                      </li>
                    )}
                    {normalizeTagName(tagDraft) === '' &&
                      tagPopular.map((h) => (
                        <li key={h.hashtag_id}>
                          <button
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => addTagByName(h.name)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              padding: '8px 10px',
                              fontSize: '0.84rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <span>#{h.name}</span>
                            <span className="feed-post-meta" style={{ fontSize: '0.75rem' }}>
                              {h.use_count ?? 0}
                            </span>
                          </button>
                        </li>
                      ))}
                    {normalizeTagName(tagDraft) !== '' &&
                      tagHits.map((h) => (
                        <li key={h.hashtag_id}>
                          <button
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => addTagByName(h.name)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              padding: '8px 10px',
                              fontSize: '0.84rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <span>#{h.name}</span>
                            <span className="feed-post-meta" style={{ fontSize: '0.75rem' }}>
                              {h.use_count ?? 0}
                            </span>
                          </button>
                        </li>
                      ))}
                    {normalizeTagName(tagDraft) !== '' && tagHits.length === 0 && (
                      <li className="feed-post-meta" style={{ padding: '10px 12px', fontSize: '0.8rem' }}>
                        일치하는 태그가 없습니다. Enter로 &quot;{normalizeTagName(tagDraft)}&quot; 추가
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>시작일</label>
                  <input style={{ ...input, marginBottom: 0 }} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label style={label}>종료일</label>
                  <input style={{ ...input, marginBottom: 0 }} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 18px 8px' }}>{error}</p>
          )}

          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 18px 16px',
              borderTop: '1px solid var(--feed-border, #e2e8f0)',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--feed-muted, #64748b)', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '52%' }}>
              <span aria-hidden>ⓘ</span>
              {mode === 'edit'
                ? 'GitHub URL 또는 배포 URL 중 하나는 필수입니다.'
                : 'GitHub URL 또는 배포 URL 중 하나는 필수입니다. 하루 최대 3개까지 등록됩니다.'}
            </p>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--feed-border, #e2e8f0)',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || coverUploading || (mode === 'create' && limitReached)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: mode === 'create' && limitReached ? '#94a3b8' : 'var(--feed-accent, #3b82f6)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: submitting || coverUploading || (mode === 'create' && limitReached) ? 'not-allowed' : 'pointer',
                }}
              >
                {mode === 'create' && limitReached
                  ? '오늘 한도 초과'
                  : submitting
                    ? mode === 'edit'
                      ? '저장 중…'
                      : '등록 중…'
                    : mode === 'edit'
                      ? '저장하기'
                      : '등록하기'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
