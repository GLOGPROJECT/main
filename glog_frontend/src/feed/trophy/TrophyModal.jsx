import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import api, { API_ORIGIN } from '../../api/axios';
import { toggleTrophyLike } from '../api/feedApi';
import { HeartIcon } from '../components/PostCard';
import ProjectRegisterModal from '../components/ProjectRegisterModal';

const TROPHY_SRC = {
  gold: '/goldtrophy.svg',
  silver: '/silvertrophy.svg',
  bronze: '/bronzetrophy.svg',
};

const GRADE_LABEL = {
  gold: '금 트로피',
  silver: '은 트로피',
  bronze: '동 트로피',
};

/** 기술 태그 캡슐 — 배경/글자 대비 있는 팔레트 순환 */
const TAG_CAPSULE_STYLES = [
  { bg: '#dbeafe', fg: '#1e3a8a' },
  { bg: '#dcfce7', fg: '#14532d' },
  { bg: '#fef3c7', fg: '#78350f' },
  { bg: '#fce7f3', fg: '#831843' },
  { bg: '#e9d5ff', fg: '#581c87' },
  { bg: '#cffafe', fg: '#134e4a' },
  { bg: '#ffedd5', fg: '#9a3412' },
  { bg: '#e0e7ff', fg: '#312e81' },
  { bg: '#fecdd3', fg: '#9f1239' },
  { bg: '#d1fae5', fg: '#065f46' },
  { bg: '#fde68a', fg: '#713f12' },
  { bg: '#fbcfe8', fg: '#831843' },
];

function tagCapsuleStyle(i) {
  const s = TAG_CAPSULE_STYLES[i % TAG_CAPSULE_STYLES.length];
  return { background: s.bg, color: s.fg };
}

function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
  return path;
}

function formatYmd(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function isoToDateInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** DB `image_url`에 쉼표·줄바꿈·| 로 여러 경로 저장 시 분리 */
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

function mapRow(row) {
  const imagePaths = parseProjectImagePaths(row.image_url);
  const galleryImages = imagePaths.map((p) => resolveMediaUrl(p)).filter(Boolean);
  return {
    id: row.project_id,
    trophyId: row.trophy_id,
    title: row.title,
    desc: String(row.description || '').trim(),
    image: galleryImages[0] || null,
    image_url_raw: row.image_url || '',
    galleryImages,
    github_url: row.github_url || null,
    deploy_url: row.deploy_url || null,
    video_url: row.video_url || null,
    techStacks: Array.isArray(row.techStacks) ? row.techStacks : [],
    dateRange: row.dateRange || '',
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    updated_at: row.updated_at ?? null,
    timeAgo: row.timeAgo || '',
    grade: row.grade,
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    contributors: Array.isArray(row.contributors) ? row.contributors : [],
  };
}

/** 전역 오버레이: 트로피·프로젝트 목록 + 상세 + 등록 */
export default function TrophyModal({ open, onClose }) {
  const { user, loading: authLoading } = useAuth();
  const [sort, setSort] = useState('latest');
  const [items, setItems] = useState([]);
  const [load, setLoad] = useState('idle');
  const [likedSet, setLikedSet] = useState(() => new Set());
  const [registerOpen, setRegisterOpen] = useState(false);
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);
  const [tagExpand, setTagExpand] = useState(false);
  const [contributorExpand, setContributorExpand] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const detailScrollRef = useRef(null);
  const [trophyLikeBusy, setTrophyLikeBusy] = useState(false);
  const uid = user?.user_id;

  const fetchList = useCallback(async () => {
    if (!uid) return;
    setLoad('loading');
    try {
      const sortParam = sort === 'oldest' ? 'oldest' : 'latest';
      const { data } = await api.get(`/projects/user/${uid}`, { params: { sort: sortParam } });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows.map(mapRow));
      setLikedSet(
        new Set(rows.filter((r) => r.liked_by_me).map((r) => `t_${r.trophy_id}`)),
      );
      setLoad('ok');
    } catch {
      setItems([]);
      setLoad('error');
    }
  }, [uid, sort]);

  useEffect(() => {
    if (!open) return;
    if (!uid) {
      setLoad('idle');
      setItems([]);
      return;
    }
    fetchList();
  }, [open, uid, fetchList]);

  useEffect(() => {
    if (!open) {
      setView('list');
      setSelected(null);
      setTagExpand(false);
      setContributorExpand(false);
      setCarouselIdx(0);
      setEditOpen(false);
      setEditDraft(null);
      setDeleteConfirmOpen(false);
      setDeleteError(null);
      setDeleteSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (view !== 'detail' || !selected) return;
    const next = items.find((x) => x.id === selected.id);
    if (!next) {
      setView('list');
      setSelected(null);
    } else {
      setSelected(next);
    }
  }, [items, view, selected?.id]);

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditDraft({
      project_id: selected.id,
      title: selected.title,
      description: selected.desc,
      github_url: selected.github_url || '',
      deploy_url: selected.deploy_url || '',
      video_url: selected.video_url || '',
      image_url: selected.image_url_raw || '',
      tags: [...selected.techStacks],
      contributors: Array.isArray(selected.contributors)
        ? selected.contributors.map((c) => ({
            user_id: c.user_id,
            nickname: c.nickname || '',
            avatar_url: c.avatar_url ?? null,
          }))
        : [],
      start_date: isoToDateInput(selected.start_date),
      end_date: isoToDateInput(selected.end_date),
    });
    setEditOpen(true);
  }, [selected]);

  const handleDeleteProject = async () => {
    if (!selected?.id) return;
    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await api.delete(`/projects/${selected.id}`);
      setDeleteConfirmOpen(false);
      setView('list');
      setSelected(null);
      await fetchList();
    } catch (err) {
      setDeleteError(err.response?.data?.message || '삭제에 실패했어요. 다시 시도해주세요.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleTrophyLike = async (trophyId) => {
    if (!user?.user_id) return;
    if (trophyLikeBusy) return;
    setTrophyLikeBusy(true);
    try {
      const { liked, likeCount } = await toggleTrophyLike(trophyId);
      setItems((prev) =>
        prev.map((t) => (t.trophyId === trophyId ? { ...t, likes: likeCount } : t)),
      );
      setSelected((prev) =>
        prev && prev.trophyId === trophyId ? { ...prev, likes: likeCount } : prev,
      );
      setLikedSet((prev) => {
        const next = new Set(prev);
        if (liked) next.add(`t_${trophyId}`);
        else next.delete(`t_${trophyId}`);
        return next;
      });
    } catch (err) {
      const msg = err.response?.data?.message;
      if (msg) console.warn('[trophy like]', msg);
    } finally {
      setTrophyLikeBusy(false);
    }
  };

  const openDetail = useCallback((t) => {
    setSelected(t);
    setView('detail');
    setTagExpand(false);
    setContributorExpand(false);
    setCarouselIdx(0);
  }, []);

  const gallerySlides = useMemo(() => {
    if (!selected) return [];
    const slides = [];
    const imgs = Array.isArray(selected.galleryImages) ? selected.galleryImages : [];
    if (imgs.length) {
      imgs.forEach((src, i) => {
        if (src) slides.push({ type: 'img', src, key: `img-${i}` });
      });
    } else if (selected.image) {
      slides.push({ type: 'img', src: selected.image, key: 'cover' });
    }
    if (selected.video_url && /^https?:\/\//i.test(selected.video_url)) {
      slides.push({ type: 'video', href: selected.video_url, key: 'video' });
    }
    if (slides.length === 0) slides.push({ type: 'placeholder', key: 'ph' });
    return slides;
  }, [selected]);

  const activeSlide = gallerySlides[carouselIdx] || gallerySlides[0];
  const galleryCanStep = gallerySlides.length > 1;
  const galleryShowThumbRow = gallerySlides.some((s) => s.type === 'img' || s.type === 'video');

  useEffect(() => {
    if (view !== 'detail' || !selected) return;
    const n = gallerySlides.length;
    if (n === 0) return;
    setCarouselIdx((i) => Math.min(Math.max(0, i), n - 1));
  }, [view, selected?.id, selected?.image_url_raw, gallerySlides.length]);

  const handleShare = async () => {
    const url = uid ? `${window.location.origin}/profile/${uid}` : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      window.alert('프로필 링크가 클립보드에 복사되었습니다.');
    } catch {
      window.alert(url);
    }
  };

  const scrollDetailToBottom = useCallback(() => {
    const el = detailScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  if (!open) return null;

  const isDetail = view === 'detail' && selected;

  const backdrop = {
    position: 'fixed',
    inset: 0,
    zIndex: 12500,
    background: 'rgba(15, 28, 54, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };
  const panel = {
    position: 'relative',
    width: isDetail ? 'min(960px, 100%)' : 'min(760px, 100%)',
    maxHeight: 'min(90vh, 900px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--feed-bg-card, #fff)',
    color: 'var(--feed-text-primary, #0f172a)',
    borderRadius: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
    border: '1px solid var(--feed-border, rgba(0,0,0,0.08))',
  };

  const muted = 'var(--feed-muted, #64748b)';
  const border = 'var(--feed-border, rgba(0,0,0,0.08))';

  return (
    <div
      role="presentation"
      style={backdrop}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trophy-modal-title"
        style={panel}
        onClick={(e) => e.stopPropagation()}
      >
        {!isDetail && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: `1px solid ${border}`,
            }}
          >
            <h2 id="trophy-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
              트로피 목록
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                border: 'none',
                background: 'none',
                fontSize: '1.4rem',
                lineHeight: 1,
                cursor: 'pointer',
                color: muted,
                padding: '4px 8px',
              }}
            >
              ×
            </button>
          </div>
        )}

        {isDetail && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              padding: '12px 18px',
              borderBottom: `1px solid ${border}`,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setView('list');
                setSelected(null);
              }}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: muted,
                padding: '6px 0',
              }}
            >
              ← 트로피 목록으로
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={openEdit}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${border}`,
                  background: '#f1f5f9',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteConfirmOpen(true);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                삭제
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '1.35rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: muted,
                  padding: '4px 6px',
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div
          ref={detailScrollRef}
          style={{ overflowY: 'auto', padding: isDetail ? '16px 18px 20px' : '16px 18px 20px', flex: 1, minHeight: 0 }}
        >
          {authLoading && (
            <p className="feed-post-meta" style={{ margin: '0.5rem 0' }}>불러오는 중…</p>
          )}
          {!authLoading && !user && (
            <div className="feed-card" style={{ padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', color: 'var(--feed-text-primary)' }}>
                로그인 후 내 프로젝트와 트로피를 확인·등록할 수 있습니다.
              </p>
              <Link to="/" className="feed-post-meta" style={{ fontWeight: 600 }} onClick={onClose}>
                랜딩으로 이동
              </Link>
            </div>
          )}

          {!authLoading && user && !isDetail && (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  총 {load === 'ok' ? items.length : 0}개의 프로젝트
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label className="feed-post-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    정렬
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: `1px solid ${border}`,
                        background: 'var(--feed-bg-page)',
                        color: 'var(--feed-text-primary)',
                        fontSize: '0.88rem',
                      }}
                    >
                      <option value="latest">최신순</option>
                      <option value="oldest">오래된순</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="feed-btn-primary"
                    onClick={() => setRegisterOpen(true)}
                  >
                    + 프로젝트 등록
                  </button>
                </div>
              </div>

              {load === 'loading' && (
                <p className="feed-post-meta" style={{ margin: '0.5rem 0' }}>불러오는 중…</p>
              )}
              {load === 'error' && (
                <p style={{ color: '#f87171', fontSize: '0.9rem' }}>목록을 불러오지 못했습니다.</p>
              )}
              {load === 'ok' && items.length === 0 && (
                <p className="feed-post-meta" style={{ margin: '0.5rem 0' }}>등록된 프로젝트가 없습니다.</p>
              )}

              {load === 'ok' &&
                items.map((t) => (
                  <article
                    key={t.id}
                    className="feed-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDetail(t);
                      }
                    }}
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: '12px 14px',
                      marginBottom: 10,
                      alignItems: 'stretch',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: 100,
                        minWidth: 100,
                        height: 76,
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: 'var(--feed-border)',
                        flexShrink: 0,
                      }}
                    >
                      {t.image ? (
                        <img src={t.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                          }}
                        >
                          📁
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="feed-post-author"
                        style={{
                          fontSize: '0.95rem',
                          marginBottom: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.title}
                      </div>
                      <p
                        className="feed-post-meta"
                        style={{
                          margin: '0 0 6px',
                          fontSize: '0.8rem',
                          lineHeight: 1.45,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {t.desc}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {t.techStacks.slice(0, 5).map((name) => (
                          <span
                            key={name}
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: 'var(--feed-bg-page)',
                              border: `1px solid ${border}`,
                              color: 'var(--feed-text-secondary)',
                            }}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                      <div className="feed-post-meta" style={{ fontSize: '0.75rem' }}>
                        {t.dateRange}
                        {t.timeAgo ? ` · ${t.timeAgo}` : ''}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        flexShrink: 0,
                        minWidth: 64,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {TROPHY_SRC[t.grade] ? (
                        <img src={TROPHY_SRC[t.grade]} alt={t.grade} style={{ width: 48, height: 'auto', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: '1.35rem' }}>🏆</span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <button
                          type="button"
                          className="feed-post-like-btn"
                          data-liked={likedSet.has(`t_${t.trophyId}`) ? 'true' : 'false'}
                          disabled={trophyLikeBusy}
                          aria-pressed={likedSet.has(`t_${t.trophyId}`)}
                          aria-label={likedSet.has(`t_${t.trophyId}`) ? '좋아요 취소' : '좋아요'}
                          onClick={() => handleTrophyLike(t.trophyId)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}
                        >
                          <HeartIcon filled={likedSet.has(`t_${t.trophyId}`)} />
                          <span style={{ pointerEvents: 'none' }}>{t.likes}</span>
                        </button>
                        <span className="feed-post-meta" style={{ fontSize: '0.75rem' }}>💬 {t.comments}</span>
                      </div>
                    </div>
                  </article>
                ))}
            </>
          )}

          {!authLoading && user && isDetail && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.05fr) minmax(260px, 1fr)',
                gap: 24,
                alignItems: 'start',
              }}
              className="trophy-detail-grid"
            >
              <style>{`
                @media (max-width: 720px) {
                  .trophy-detail-grid { grid-template-columns: 1fr !important; }
                }
                .trophy-detail-footer {
                  grid-column: 1 / -1;
                  width: 100%;
                }
              `}</style>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: '#0f172a',
                    minHeight: 220,
                  }}
                >
                  <div
                    style={{
                      minHeight: 220,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {activeSlide?.type === 'img' && (
                      <img src={activeSlide.src} alt="" style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
                    )}
                    {activeSlide?.type === 'video' && (
                      <a
                        href={activeSlide.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#93c5fd', fontWeight: 600, padding: 24, textAlign: 'center' }}
                      >
                        영상 열기 (새 탭)
                      </a>
                    )}
                    {activeSlide?.type === 'placeholder' && (
                      <span style={{ color: '#94a3b8', fontSize: '3rem' }}>📁</span>
                    )}
                  </div>
                </div>
                {galleryShowThumbRow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    {galleryCanStep ? (
                      <button
                        type="button"
                        aria-label="이전"
                        onClick={() => setCarouselIdx((i) => (i - 1 + gallerySlides.length) % gallerySlides.length)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: `1px solid ${border}`,
                          background: 'var(--feed-bg-page)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: '1.1rem',
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ‹
                      </button>
                    ) : (
                      <div style={{ width: 36, height: 36, flexShrink: 0 }} aria-hidden />
                    )}
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flex: 1,
                        overflowX: 'auto',
                        justifyContent: gallerySlides.filter((s) => s.type === 'img').length <= 1 ? 'center' : 'flex-start',
                      }}
                    >
                      {gallerySlides.map((s, i) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setCarouselIdx(i)}
                          style={{
                            width: 72,
                            height: 52,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: carouselIdx === i ? '2px solid #3b82f6' : `1px solid ${border}`,
                            padding: 0,
                            cursor: 'pointer',
                            flexShrink: 0,
                            background: '#0f172a',
                          }}
                        >
                          {s.type === 'img' ? (
                            <img src={s.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ fontSize: '0.65rem', color: '#93c5fd', padding: 4 }}>▶ 영상</div>
                          )}
                        </button>
                      ))}
                    </div>
                    {galleryCanStep ? (
                      <button
                        type="button"
                        aria-label="다음"
                        onClick={() => setCarouselIdx((i) => (i + 1) % gallerySlides.length)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: `1px solid ${border}`,
                          background: 'var(--feed-bg-page)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: '1.1rem',
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ›
                      </button>
                    ) : (
                      <div style={{ width: 36, height: 36, flexShrink: 0 }} aria-hidden />
                    )}
                  </div>
                )}
              </div>

              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {TROPHY_SRC[selected.grade] ? (
                    <img src={TROPHY_SRC[selected.grade]} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: '1.75rem', lineHeight: 1 }} aria-hidden>
                      🏆
                    </span>
                  )}
                  <span style={{ fontSize: '1.42rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                    {GRADE_LABEL[selected.grade] || '트로피'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      lineHeight: 1.3,
                      color: 'var(--feed-text-primary)',
                      flex: '1 1 120px',
                      minWidth: 0,
                    }}
                  >
                    {selected.title}
                  </h3>
                  <button
                    type="button"
                    className="feed-post-like-btn"
                    data-liked={likedSet.has(`t_${selected.trophyId}`) ? 'true' : 'false'}
                    disabled={trophyLikeBusy}
                    aria-pressed={likedSet.has(`t_${selected.trophyId}`)}
                    aria-label={likedSet.has(`t_${selected.trophyId}`) ? '좋아요 취소' : '좋아요'}
                    onClick={() => handleTrophyLike(selected.trophyId)}
                    style={{
                      flexShrink: 0,
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      position: 'relative',
                      zIndex: 1,
                      padding: '6px 10px',
                      borderRadius: 8,
                    }}
                  >
                    <HeartIcon filled={likedSet.has(`t_${selected.trophyId}`)} />
                    <span style={{ pointerEvents: 'none' }}>{selected.likes}</span>
                  </button>
                </div>
                <p
                  style={{
                    margin: '0 0 14px',
                    fontSize: '0.88rem',
                    lineHeight: 1.55,
                    color: 'var(--feed-text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selected.desc}
                </p>

                {(selected.github_url || selected.deploy_url || selected.start_date || selected.end_date) && (
                  <div
                    style={{
                      background: '#f1f5f9',
                      border: `1px solid ${border}`,
                      borderRadius: 12,
                      padding: '10px 12px',
                      marginBottom: 14,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selected.github_url && (
                        <a
                          href={selected.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px 4px 5px',
                            borderRadius: 999,
                            border: `1px solid ${border}`,
                            background: '#fff',
                            textDecoration: 'none',
                            color: 'inherit',
                            maxWidth: '100%',
                          }}
                        >
                          <img src="/icons/project-github.svg" alt="" width={22} height={22} style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 2 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.68rem', lineHeight: 1.2 }}>GitHub</div>
                            <div
                              className="feed-post-meta"
                              style={{
                                fontSize: '0.62rem',
                                wordBreak: 'break-all',
                                marginTop: 1,
                                lineHeight: 1.35,
                                opacity: 0.92,
                              }}
                            >
                              {selected.github_url}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.7rem', opacity: 0.4, flexShrink: 0, alignSelf: 'center' }} aria-hidden>
                            ↗
                          </span>
                        </a>
                      )}
                      {selected.deploy_url && (
                        <a
                          href={selected.deploy_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px 4px 5px',
                            borderRadius: 999,
                            border: `1px solid ${border}`,
                            background: '#fff',
                            textDecoration: 'none',
                            color: 'inherit',
                            maxWidth: '100%',
                          }}
                        >
                          <img src="/icons/project-deploy.svg" alt="" width={22} height={22} style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 2 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.68rem', lineHeight: 1.2 }}>배포 URL</div>
                            <div
                              className="feed-post-meta"
                              style={{
                                fontSize: '0.62rem',
                                wordBreak: 'break-all',
                                marginTop: 1,
                                lineHeight: 1.35,
                                opacity: 0.92,
                              }}
                            >
                              {selected.deploy_url}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.7rem', opacity: 0.4, flexShrink: 0, alignSelf: 'center' }} aria-hidden>
                            ↗
                          </span>
                        </a>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        flexShrink: 0,
                        fontSize: '0.72rem',
                        color: muted,
                        minWidth: 88,
                        paddingTop: 2,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--feed-text-primary)', fontSize: '0.7rem' }}>시작일</div>
                        <div>{formatYmd(selected.start_date) || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--feed-text-primary)', fontSize: '0.7rem' }}>완성일</div>
                        <div>{formatYmd(selected.end_date) || '—'}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 6, fontSize: '0.78rem', fontWeight: 700 }}>기술 태그</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  {(tagExpand ? selected.techStacks : selected.techStacks.slice(0, 5)).map((name, i) => (
                    <span
                      key={`tag-${name}`}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '5px 10px',
                        borderRadius: 999,
                        ...tagCapsuleStyle(i),
                      }}
                    >
                      #{name}
                    </span>
                  ))}
                  {selected.techStacks.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setTagExpand((v) => !v)}
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#2563eb',
                        padding: '4px 6px',
                      }}
                    >
                      {tagExpand ? '접기' : '더보기'}
                    </button>
                  )}
                </div>
              </div>

              <div
                className="trophy-detail-footer"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingTop: 14,
                  marginTop: 4,
                  borderTop: `1px solid ${border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: '1 1 200px' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: '#e2e8f0',
                      border: `1px solid ${border}`,
                    }}
                  >
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.1rem',
                          color: muted,
                        }}
                        aria-hidden
                      >
                        👤
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--feed-text-primary)' }}>
                        {user?.nickname || user?.github_id || '—'}
                      </span>
                      {(() => {
                        const contribs = selected.contributors || [];
                        const multi = contribs.length >= 2;
                        const shown = multi && !contributorExpand ? contribs.slice(0, 2) : contribs;
                        return (
                          <>
                            {multi ? (
                              <button
                                type="button"
                                onClick={() => setContributorExpand((v) => !v)}
                                aria-label={contributorExpand ? '기여자 접기' : '기여자 펼치기'}
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: '50%',
                                  border: 'none',
                                  background: '#0f172a',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '1rem',
                                  lineHeight: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  padding: 0,
                                  fontWeight: 700,
                                }}
                              >
                                {contributorExpand ? '−' : '+'}
                              </button>
                            ) : null}
                            {shown.map((c) => (
                              <div
                                key={c.user_id}
                                title={c.nickname || undefined}
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  border: `1px solid ${border}`,
                                  flexShrink: 0,
                                  background: '#f1f5f9',
                                }}
                              >
                                {c.avatar_url ? (
                                  <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : null}
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                    {user?.bio ? (
                      <p
                        className="feed-post-meta"
                        style={{ margin: '4px 0 0', fontSize: '0.78rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}
                      >
                        {user.bio}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 8,
                    flexShrink: 0,
                    maxWidth: '100%',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleShare}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        minHeight: 40,
                        padding: '0 18px',
                        borderRadius: 999,
                        border: `1px solid ${border}`,
                        background: 'var(--feed-bg-card, #fff)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        color: 'var(--feed-text-primary)',
                      }}
                    >
                      공유하기
                    </button>
                    <button
                      type="button"
                      onClick={scrollDetailToBottom}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        minHeight: 40,
                        padding: '0 18px',
                        borderRadius: 999,
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                      }}
                    >
                      댓글달기
                    </button>
                  </div>
                  <div className="feed-post-meta" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
                    마지막 업데이트 {formatYmd(selected.updated_at) || '—'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {deleteConfirmOpen && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 13500,
            background: 'rgba(15, 28, 54, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => {
            if (!deleteSubmitting) setDeleteConfirmOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-project-title"
            style={{
              maxWidth: 400,
              width: '100%',
              background: 'var(--feed-bg-card, #fff)',
              borderRadius: 14,
              padding: '20px 22px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
              border: '1px solid var(--feed-border, rgba(0,0,0,0.08))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="del-project-title" style={{ margin: '0 0 10px', fontSize: '1.05rem', fontWeight: 800 }}>
              프로젝트 삭제
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--feed-text-primary)' }}>
              삭제하면 트로피와 좋아요 데이터가 모두 사라져요. 삭제할까요?
            </p>
            {deleteError && (
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#dc2626' }}>{deleteError}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => {
                  if (!deleteSubmitting) setDeleteConfirmOpen(false);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--feed-border, #e2e8f0)',
                  background: 'transparent',
                  cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleDeleteProject}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleteSubmitting ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProjectRegisterModal
        mode="edit"
        open={editOpen}
        initialDraft={editDraft}
        onClose={() => {
          setEditOpen(false);
          setEditDraft(null);
        }}
        onSuccess={() => {
          fetchList();
          setEditOpen(false);
          setEditDraft(null);
        }}
      />

      <ProjectRegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={() => {
          fetchList();
        }}
      />
    </div>
  );
}
