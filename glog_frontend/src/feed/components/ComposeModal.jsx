import { useCallback, useEffect, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { useAuth } from '../../auth/hooks/useAuth';
import { getMockHashtagSuggestions } from '../mocks/feedMock';
import { fetchLinkPreview } from '../api/feedApi';
import { fetchHashtagAutocomplete, fetchPopularHashtags } from '../api/searchApi';
import { readSubscribedTagSlugs, removeSubscribedTagSlug } from '../utils/tagSubscribeStorage';
import { ANON_AVATAR_SRCS, ANON_AVATAR_COUNT, getAnonAvatarIndex, getStableAnonIndexFromPostId } from '../utils/anonAvatar';
import { getTagPillColors } from '../utils/tagPillColors';

const VIS_OPTIONS = [
  { label: '공개', value: '공개', hint: '모든 사용자에게 보입니다. 해시태그 1개 이상 필요합니다.' },
  { label: '익명', value: '익명', hint: 'DB에는 user_id가 저장되고, 피드에서는 익명 닉·고정 아바타(10종 중)로 표시됩니다.' },
];

const MAX_BODY = 5000;
const MAX_TAGS = 5;
const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function formatTagPostCount(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(x);
}

function visToApi(vis) {
  if (vis === '익명') return 'anonymous';
  return 'public';
}

function typeToVis(post) {
  if (post?.type === 'anonymous') return '익명';
  return '공개';
}

function makeTextBlock(value = '') {
  return { id: `b-t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'text', value };
}

function makeCodeBlock(value = '', lang = 'text') {
  return { id: `b-c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'code', value, lang };
}


function blocksToDraft(blocks) {
  const merged = blocks
    .map((b) => (b.type === 'code' ? `\`\`\`${b.lang || 'text'}\n${b.value || ''}\n\`\`\`` : b.value || ''))
    .join('\n')
    .trim();
  const firstCode = blocks.find((b) => b.type === 'code' && (b.value || '').trim());
  const code = firstCode ? { lang: firstCode.lang || 'text', snippet: firstCode.value } : null;
  return { body: merged, code };
}

function postToBlocks(post) {
  const text = typeof post?.body === 'string' ? post.body : '';
  const code = post?.code?.snippet ? [{ id: `edit-code-${post.id}`, type: 'code', value: post.code.snippet, lang: post.code.lang || 'text' }] : [];
  return [makeTextBlock(text), ...code];
}

function buildLocalPost(vis, body, tags, code, images, author, draftAnonIdx, linkPreview = null) {
  const anonymous = vis === '익명';
  const id = `local-${Date.now()}`;
  const type = vis === '익명' ? 'anonymous' : 'public';
  return {
    id,
    type,
    author: anonymous ? { handle: '익명', title: '익명', streak: '' } : author,
    anonymousAvatarIndex:
      anonymous && draftAnonIdx != null && draftAnonIdx >= 0 && draftAnonIdx < ANON_AVATAR_COUNT
        ? draftAnonIdx
        : anonymous
          ? getStableAnonIndexFromPostId(id)
          : undefined,
    tags: anonymous ? [] : tags.length ? [...tags] : [],
    body: body.trim(),
    linkPreview: linkPreview && linkPreview.url ? { ...linkPreview } : null,
    likes: 0,
    commentsCount: 0,
    is_edited: false,
    images: images || [],
    code: code ?? null,
  };
}

function mergeServerPost(data, vis, body, tags, code, images, author, draftAnonIdx, linkPreview) {
  if (!data || typeof data !== 'object') return null;
  const raw = data.post ?? data;
  const serverId = raw.post_id ?? raw.id;
  if (serverId == null) return null;
  const base = buildLocalPost(vis, body, tags, code, images, author, draftAnonIdx, linkPreview);
  const lp = raw.link_preview ?? raw.linkPreview;
  const mergedLink =
    lp && lp.url
      ? {
          url: lp.url,
          title: lp.title || lp.url,
          description: lp.description || '',
          image: lp.image || '',
        }
      : base.linkPreview;
  return {
    ...base,
    id: String(serverId),
    body: typeof raw.content === 'string' ? raw.content : base.body,
    likes: raw.like_count ?? raw.likesCount ?? raw.likes ?? base.likes,
    commentsCount: raw.comment_count ?? raw.commentsCount ?? base.commentsCount,
    anonymousAvatarIndex:
      raw.anonymousAvatarIndex != null || raw.anonymous_avatar_index != null
        ? Number(raw.anonymousAvatarIndex ?? raw.anonymous_avatar_index)
        : base.anonymousAvatarIndex,
    type: raw.type ?? base.type,
    linkPreview: mergedLink,
  };
}

export default function ComposeModal({ open, onClose, editPost = null, initialAction = null }) {
  const { user } = useAuth();
  const [vis, setVis] = useState('공개');
  const [blocks, setBlocks] = useState([makeTextBlock('')]);
  const [activeTextId, setActiveTextId] = useState(null);
  const [activeTextSel, setActiveTextSel] = useState(0);
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [tagFocused, setTagFocused] = useState(false);
  const [images, setImages] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [draftAnonIdx, setDraftAnonIdx] = useState(null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [linkBarOpen, setLinkBarOpen] = useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [linkFetchBusy, setLinkFetchBusy] = useState(false);
  const [linkFetchError, setLinkFetchError] = useState('');
  const fileInputRef = useRef(null);
  const blockRefs = useRef({});
  const blurTimer = useRef(null);

  const { body: composedBody, code: composedCode } = useMemo(() => blocksToDraft(blocks), [blocks]);
  const leadCheck = useMemo(() => {
    const firstCodeIdx = blocks.findIndex((b) => b.type === 'code');
    let leadingPlainText = '';
    if (firstCodeIdx < 0) {
      leadingPlainText = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.value || '')
        .join('\n')
        .trim();
    } else {
      for (let i = 0; i < firstCodeIdx; i++) {
        const b = blocks[i];
        if (b.type === 'text') leadingPlainText += b.value || '';
      }
      leadingPlainText = leadingPlainText.trim();
    }
    const isEdit = Boolean(editPost);
    const pendingLink = !isEdit && linkUrlDraft.trim().length > 0;
    const needsLeadingPlain =
      blocks.some((b) => b.type === 'code') ||
      images.length > 0 ||
      Boolean(linkPreview?.url) ||
      pendingLink;
    return {
      leadingPlainOk: !needsLeadingPlain || leadingPlainText.length >= 1,
    };
  }, [blocks, images.length, linkPreview?.url, linkUrlDraft, editPost]);
  const currentAuthor = useMemo(
    () => ({
      handle: user?.nickname || user?.username || user?.handle || user?.name || 'me',
      title: user?.bio || 'GitHub User',
      streak: '',
      avatarUrl: user?.avatar_url || undefined,
      userId: user?.user_id != null && Number(user.user_id) >= 1 ? Number(user.user_id) : undefined,
    }),
    [user]
  );
  const bodyLen = composedBody.length;
  const overBody = bodyLen > MAX_BODY;
  const needsTags = vis === '공개';
  const tagsOk = !needsTags || tags.length >= 1;
  const canSubmit =
    composedBody.trim().length > 0 && !overBody && !loading && tagsOk && leadCheck.leadingPlainOk;

  const deferredTagDraft = useDeferredValue(tagDraft);
  const tagQueryNorm = useMemo(
    () => deferredTagDraft.replace(/^#+/, '').trim().toLowerCase(),
    [deferredTagDraft]
  );

  const [tagSubsRev, setTagSubsRev] = useState(0);
  useEffect(() => {
    const bump = () => setTagSubsRev((n) => n + 1);
    window.addEventListener('glog:tag-subs-changed', bump);
    return () => window.removeEventListener('glog:tag-subs-changed', bump);
  }, []);

  const { data: popularRowsRaw = [] } = useQuery({
    queryKey: ['hashtags', 'popularForCompose', 200],
    queryFn: () => fetchPopularHashtags(200),
    enabled: Boolean(open && needsTags),
    staleTime: 60_000,
  });

  const { data: acRowsRaw = [] } = useQuery({
    queryKey: ['hashtags', 'autocompleteCompose', tagQueryNorm],
    queryFn: () => fetchHashtagAutocomplete(tagQueryNorm),
    enabled: Boolean(open && needsTags && tagQueryNorm.length >= 1),
    staleTime: 15_000,
  });

  const { recommendRows } = useMemo(() => {
    if (tags.length >= MAX_TAGS) return { recommendRows: [] };
    const takenLower = new Set(tags.map((t) => t.toLowerCase()));
    const tryName = (name, useCount) => {
      const n = String(name || '').trim();
      if (!n || takenLower.has(n.toLowerCase())) return null;
      return { name: n, use_count: Number(useCount) || 0 };
    };

    const popularList =
      popularRowsRaw.length > 0
        ? popularRowsRaw
        : getMockHashtagSuggestions(tagQueryNorm || '').map((x) => ({
            name: x.tag,
            use_count: typeof x.posts === 'number' ? x.posts : Number(x.posts) || 0,
          }));

    const outRec = [];
    const seenRec = new Set();

    if (!tagQueryNorm) {
      for (const r of popularList) {
        const row = tryName(r.name, r.use_count);
        if (!row || seenRec.has(row.name.toLowerCase())) continue;
        seenRec.add(row.name.toLowerCase());
        outRec.push(row);
        if (outRec.length >= 5) break;
      }
    } else {
      for (const r of popularList) {
        if (!String(r.name || '').toLowerCase().includes(tagQueryNorm)) continue;
        const row = tryName(r.name, r.use_count);
        if (!row || seenRec.has(row.name.toLowerCase())) continue;
        seenRec.add(row.name.toLowerCase());
        outRec.push(row);
        if (outRec.length >= 5) break;
      }
      for (const r of acRowsRaw || []) {
        if (outRec.length >= 5) break;
        const row = tryName(r.name, r.use_count);
        if (!row || seenRec.has(row.name.toLowerCase())) continue;
        seenRec.add(row.name.toLowerCase());
        outRec.push(row);
      }
    }

    return { recommendRows: outRec };
  }, [popularRowsRaw, acRowsRaw, tagQueryNorm, tags, tagSubsRev]);

  const registeredRows = useMemo(() => {
    const out = [];
    for (const slug of readSubscribedTagSlugs()) {
      if (out.length >= 5) break;
      if (tagQueryNorm && !String(slug).toLowerCase().includes(tagQueryNorm)) continue;
      out.push(String(slug).trim());
    }
    return out;
  }, [tagQueryNorm, tagSubsRev]);

  const revokeObjectUrls = useCallback((list) => {
    list.forEach((i) => {
      if (i?.url && String(i.url).startsWith('blob:')) URL.revokeObjectURL(i.url);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editPost) {
      setVis(typeToVis(editPost));
      setDraftAnonIdx(typeToVis(editPost) === '익명' ? getAnonAvatarIndex(editPost) : null);
      setBlocks(postToBlocks(editPost));
      setTags(Array.isArray(editPost.tags) ? [...editPost.tags] : []);
      setImages((prev) => {
        revokeObjectUrls(prev);
        const urls = Array.isArray(editPost.images) ? editPost.images : [];
        return urls.map((url, i) => ({ id: `edit-${editPost.id}-${i}`, url: typeof url === 'string' ? url : String(url) }));
      });
    } else {
      setVis('공개');
      setDraftAnonIdx(null);
      setBlocks([makeTextBlock('')]);
      setTags([]);
      setImages((prev) => {
        revokeObjectUrls(prev);
        return [];
      });
    }
    setTagDraft('');
    setSubmitError('');
    setLoading(false);
    setActiveTextId(null);
    setActiveTextSel(0);
    setLinkPreview(null);
    setLinkBarOpen(false);
    setLinkUrlDraft('');
    setLinkFetchError('');
  }, [open, editPost?.id, revokeObjectUrls]);

  useLayoutEffect(() => {
    if (!open) return;
    if (editPost) return;
    if (vis === '익명') {
      setDraftAnonIdx((prev) => (prev == null ? Math.floor(Math.random() * ANON_AVATAR_COUNT) : prev));
    } else {
      setDraftAnonIdx(null);
    }
  }, [vis, open, editPost]);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const updateBlock = useCallback((id, key, value) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [key]: value } : b)));
  }, []);

  const removeImage = useCallback((id) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.url && String(target.url).startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const addImageFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    setImages((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_IMAGES) break;
        if (!MIME_OK.has(file.type)) continue;
        if (file.size > MAX_BYTES) continue;
        next.push({ id: `${file.name}-${file.size}-${next.length}`, file, url: URL.createObjectURL(file) });
      }
      return next;
    });
  }, []);

  const removeCodeBlock = useCallback((id) => {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (!next.length) return [makeTextBlock('')];
      return next;
    });
  }, []);


  const insertCodeBlockAtCursor = useCallback(() => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === activeTextId && b.type === 'text');
      if (idx < 0) {
        const next = [...prev, makeCodeBlock('')];
        const target = next[next.length - 1].id;
        setTimeout(() => blockRefs.current[target]?.focus(), 0);
        return next;
      }
      const current = prev[idx];
      const pos = Math.max(0, Math.min(activeTextSel, (current.value || '').length));
      const before = current.value.slice(0, pos);
      const after = current.value.slice(pos);
      const code = makeCodeBlock('');
      const pieces = [];
      if (before || prev.length === 1) pieces.push({ ...current, value: before });
      pieces.push(code);
      if (after) pieces.push(makeTextBlock(after));
      const next = [...prev.slice(0, idx), ...pieces, ...prev.slice(idx + 1)];
      setTimeout(() => blockRefs.current[code.id]?.focus(), 0);
      return next;
    });
  }, [activeTextId, activeTextSel]);

  useEffect(() => {
    if (!open || editPost) return;
    if (initialAction === 'code') {
      insertCodeBlockAtCursor();
      return;
    }
    if (initialAction === 'image') {
      const t = setTimeout(() => fileInputRef.current?.click(), 0);
      return () => clearTimeout(t);
    }
    if (initialAction === 'link') {
      setLinkBarOpen(true);
    }
  }, [open, initialAction, editPost, insertCodeBlockAtCursor]);

  const addTag = useCallback(
    (raw) => {
      const t = raw.replace(/^#+/, '').trim();
      if (!t || tags.length >= MAX_TAGS) return;
      const lower = t.toLowerCase();
      setTags((prev) => (prev.some((x) => x.toLowerCase() === lower) ? prev : [...prev, t]));
      setTagDraft('');
    },
    [tags]
  );

  const removeRegisteredTag = useCallback((slug) => {
    removeSubscribedTagSlug(slug);
    setTags((prev) => prev.filter((x) => x.toLowerCase() !== String(slug).toLowerCase()));
  }, []);

  const loadLinkPreview = useCallback(async () => {
    setLinkFetchError('');
    const u = linkUrlDraft.trim();
    if (!u) {
      setLinkFetchError('URL을 입력해 주세요.');
      return;
    }
    setLinkFetchBusy(true);
    try {
      const p = await fetchLinkPreview(u);
      setLinkPreview({
        url: p.url,
        title: p.title || p.url,
        description: p.description || '',
        image: p.image || '',
      });
      setLinkUrlDraft('');
      setLinkBarOpen(false);
    } catch (err) {
      const msg = err.response?.data?.error ?? err.message ?? '미리보기 실패';
      setLinkFetchError(typeof msg === 'string' ? msg : '미리보기 실패');
    } finally {
      setLinkFetchBusy(false);
    }
  }, [linkUrlDraft]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (vis === '공개' && tags.length < 1) {
      setSubmitError('공개 게시글은 해시태그를 1개 이상 입력해 주세요.');
      return;
    }
    setSubmitError('');
    setLoading(true);

    const imageUrls = images.map((img) => img.url).filter(Boolean);
    const code = composedCode;
    const body = composedBody;
    const effectiveTags = vis === '익명' ? [] : tags;

    try {
      let resolvedLinkPreview = linkPreview;
      const pendingLinkUrl = linkUrlDraft.trim();
      if (pendingLinkUrl && (!resolvedLinkPreview?.url || resolvedLinkPreview.url !== pendingLinkUrl)) {
        try {
          const p = await fetchLinkPreview(pendingLinkUrl);
          resolvedLinkPreview = {
            url: p.url,
            title: p.title || p.url,
            description: p.description || '',
            image: p.image || '',
          };
          setLinkPreview(resolvedLinkPreview);
          setLinkUrlDraft('');
          setLinkFetchError('');
          setLinkBarOpen(false);
        } catch (e) {
          const msg = e.response?.data?.error ?? e.message ?? '링크 미리보기 실패';
          setSubmitError(typeof msg === 'string' ? msg : '링크 미리보기에 실패했습니다.');
          return;
        }
      }

      if (editPost) {
        let patchOk = false;
        let lastErr = null;
        try {
          const fd = new FormData();
          fd.append('content', body.trim());
          fd.append('hashtags', JSON.stringify(tags));
          if (code) fd.append('code', JSON.stringify(code));
          images.forEach((img) => {
            if (img.file) fd.append('images', img.file);
          });
          await api.patch(`/feed/${editPost.id}`, fd);
          patchOk = true;
        } catch (e1) {
          lastErr = e1;
          try {
            await api.patch(`/feed/${editPost.id}`, {
              content: body.trim(),
              hashtags: JSON.stringify(tags),
              code: code ? JSON.stringify(code) : null,
            });
            patchOk = true;
          } catch (e2) {
            lastErr = e2;
          }
        }
        if (!patchOk) {
          const msg = lastErr?.response?.data?.message ?? lastErr?.response?.data?.error ?? lastErr?.message;
          setSubmitError(typeof msg === 'string' ? msg : '게시글 수정에 실패했습니다. (PATCH /feed)');
          return;
        }
        const updated = {
          ...editPost,
          body: body.trim(),
          tags: tags.length ? [...tags] : editPost.tags,
          is_edited: true,
          images: imageUrls,
          code,
        };
        try {
          sessionStorage.setItem(`glog:post:${editPost.id}`, JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent('glog:post-updated', { detail: { postId: String(editPost.id), post: updated } }));
        onClose();
        return;
      }

      const fd = new FormData();
      fd.append('content', body.trim());
      fd.append('type', visToApi(vis));
      fd.append('hashtags', JSON.stringify(effectiveTags));
      if (vis === '익명' && draftAnonIdx != null) {
        fd.append('anonymous_avatar_index', String(draftAnonIdx));
      }
      if (code) fd.append('code', JSON.stringify(code));
      if (resolvedLinkPreview?.url) {
        fd.append(
          'link_preview',
          JSON.stringify({
            url: resolvedLinkPreview.url,
            title: resolvedLinkPreview.title,
            description: resolvedLinkPreview.description,
            image: resolvedLinkPreview.image,
          })
        );
      }
      for (const { file } of images) {
        if (file) fd.append('images', file);
      }
      const { data } = await api.post('/feed', fd);
      const merged = mergeServerPost(
        data,
        vis,
        body,
        effectiveTags,
        code,
        imageUrls,
        currentAuthor,
        draftAnonIdx,
        resolvedLinkPreview
      );
      const post =
        merged ?? buildLocalPost(vis, body, effectiveTags, code, imageUrls, currentAuthor, draftAnonIdx, resolvedLinkPreview);
      try {
        sessionStorage.setItem(`glog:post:${post.id}`, JSON.stringify(post));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('glog:new-post', { detail: post }));
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message ?? err.response?.data?.error ?? err.message;
      setSubmitError(typeof msg === 'string' ? msg : '전송에 실패했습니다. (POST /feed)');
    } finally {
      setLoading(false);
    }
  };

  const onTagBlur = () => {
    blurTimer.current = setTimeout(() => setTagFocused(false), 180);
  };
  const onTagFocus = () => {
    clearTimeout(blurTimer.current);
    setTagFocused(true);
  };

  if (!open) return null;

  const tagInputDisabled = tags.length >= MAX_TAGS;
  const isEdit = Boolean(editPost);

  return (
    <div className="feed-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="compose-title" onClick={onClose}>
      <div className="feed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feed-modal-header">
          <h2 id="compose-title" className="feed-modal-title">{isEdit ? '게시글 수정' : '새 게시글'}</h2>
          <button type="button" className="feed-modal-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="feed-visibility-row">
          {VIS_OPTIONS.map(({ label, value }) => (
            <button key={value} type="button" disabled={isEdit} className={`feed-visibility-btn ${vis === value ? 'feed-vis-active' : ''}`} onClick={() => setVis(value)}>
              {label}
            </button>
          ))}
        </div>
        <p className="feed-post-meta" style={{ padding: '0 1rem', margin: '0.35rem 0 0', fontSize: '0.72rem' }}>
          {isEdit ? '수정 모드에서는 공개 범위 변경 없음 (연동 시 PATCH 규칙에 맞게 확장)' : VIS_OPTIONS.find((v) => v.value === vis)?.hint}
        </p>

        <div className="feed-modal-body feed-compose-drop" data-drop={dropActive ? '1' : undefined}>
          <div
            className={dropActive ? 'feed-compose-drop-active' : undefined}
            style={{ borderRadius: 8 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropActive(false);
              addImageFiles(e.dataTransfer.files);
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {vis === '익명' ? (
                <div className="feed-avatar feed-avatar-sm feed-avatar-anon-lg feed-avatar-anon-img" aria-hidden>
                  <img
                    src={ANON_AVATAR_SRCS[draftAnonIdx != null ? draftAnonIdx : 0]}
                    alt=""
                    width={70}
                    height={70}
                    decoding="async"
                  />
                </div>
              ) : user?.avatar_url ? (
                <div className="feed-avatar feed-avatar-sm feed-avatar-img" aria-hidden>
                  <img src={user.avatar_url} alt="" width={36} height={36} decoding="async" />
                </div>
              ) : (
                <div className="feed-avatar feed-avatar-sm" aria-hidden />
              )}
              <div className="feed-input-area" style={{ flex: 1 }}>
                <div className="feed-compose-blocks">
                  {blocks.map((b) =>
                    b.type === 'code' ? (
                      <div key={b.id} className="feed-inline-code-wrap">
                        <div className="feed-inline-code-head">
                          <input
                            className="feed-code-lang-input"
                            value={b.lang || 'text'}
                            onChange={(e) => updateBlock(b.id, 'lang', e.target.value)}
                            placeholder="언어"
                            aria-label="코드 언어"
                          />
                          <button
                            type="button"
                            className="feed-inline-code-remove"
                            aria-label="코드 블록 삭제"
                            onClick={() => removeCodeBlock(b.id)}
                          >
                            ×
                          </button>
                        </div>
                        <textarea
                          ref={(el) => { blockRefs.current[b.id] = el; }}
                          className="feed-code-editor"
                          placeholder="코드를 입력하세요"
                          value={b.value}
                          onChange={(e) => updateBlock(b.id, 'value', e.target.value)}
                        />
                      </div>
                    ) : (
                      <textarea
                        key={b.id}
                        ref={(el) => { blockRefs.current[b.id] = el; }}
                        className="feed-compose-body-editor"
                        placeholder="무슨 작업 중인가요?"
                        value={b.value}
                        onFocus={(e) => {
                          setActiveTextId(b.id);
                          setActiveTextSel(e.currentTarget.selectionStart || 0);
                        }}
                        onSelect={(e) => {
                          setActiveTextId(b.id);
                          setActiveTextSel(e.currentTarget.selectionStart || 0);
                        }}
                        onChange={(e) => updateBlock(b.id, 'value', e.target.value)}
                        aria-invalid={overBody}
                      />
                    )
                  )}
                </div>
                <div className={`feed-post-meta ${overBody ? 'feed-char-count-over' : ''}`} style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                  {bodyLen} / 5,000
                </div>
              </div>
            </div>

            {vis !== '익명' || (isEdit && editPost?.type !== 'anonymous') ? (
              <>
                <p style={{ fontSize: '0.85rem', margin: '1rem 0 0.25rem' }}>해시태그 (최대 5개){!isEdit && vis === '공개' ? ' · 공개 글은 1개 이상 필수' : ''}</p>
                <div className="feed-hashtag-input" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', minHeight: 40 }}>
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="feed-tag-pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        ...getTagPillColors(t),
                        borderRadius: '999px',
                        padding: '0.2rem 0.45rem',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                      }}
                    >
                      {t}
                      <button
                        type="button"
                        className="feed-tag-pill-x"
                        aria-label={`${t} 태그 제거`}
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 0 0 4px', color: 'inherit', fontSize: '0.9rem', lineHeight: 1, fontWeight: 700 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <div style={{ display: 'flex', flex: 1, minWidth: 120, alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="text"
                      disabled={tagInputDisabled}
                      placeholder={tagInputDisabled ? '태그 5개까지' : '# 태그 입력'}
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onFocus={onTagFocus}
                      onBlur={onTagBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(tagDraft);
                        }
                      }}
                      style={{ border: 'none', outline: 'none', flex: 1, minWidth: 60, background: 'transparent', color: 'var(--feed-text-primary)' }}
                    />
                    <span className="feed-hashtag-count" aria-live="polite">
                      {tags.length}/{MAX_TAGS}
                    </span>
                  </div>
                </div>
                {tagFocused && !tagInputDisabled && (recommendRows.length > 0 || registeredRows.length > 0) ? (
                  <div className="feed-autocomplete feed-autocomplete--compose" role="listbox">
                    {recommendRows.length > 0 ? (
                      <>
                        <div className="feed-autocomplete-section-title">추천 태그 Top 5</div>
                        {recommendRows.map((h) => (
                          <button
                            key={`rec-${h.name}`}
                            type="button"
                            className="feed-autocomplete-row"
                            role="option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addTag(h.name)}
                          >
                            <span>{h.name}</span>
                            <span className="feed-autocomplete-count">{formatTagPostCount(h.use_count)}</span>
                          </button>
                        ))}
                      </>
                    ) : null}
                    {registeredRows.length > 0 ? (
                      <>
                        <div className="feed-autocomplete-section-title">등록 태그</div>
                        {registeredRows.map((name) => (
                          <div key={`reg-${name}`} className="feed-autocomplete-registered-row" role="option">
                            <button
                              type="button"
                              className="feed-autocomplete-registered-name"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => addTag(name)}
                            >
                              {name}
                            </button>
                            <button
                              type="button"
                              className="feed-autocomplete-registered-remove"
                              aria-label={`${name} 등록 해제`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => removeRegisteredTag(name)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </>
                    ) : null}
                  </div>
                ) : null}
                <p className="feed-api-hint">추천: 인기 태그 · 등록 태그: 피드에서 구독한 태그(X로 목록에서 제거)</p>
              </>
            ) : null}

            <p style={{ fontSize: '0.85rem', margin: '1rem 0 0.25rem' }}>
              {isEdit ? '이미지 (기존 삭제·추가, 최대 4장 / 장당 5MB)' : '이미지 첨부 (최대 4장 / 장당 5MB / jpg·png·gif·webp)'}
            </p>
            <div className="feed-image-slots">
              {images.map((img) => (
                <div key={img.id} className="feed-image-thumb-wrap">
                  <img src={img.url} alt="" />
                  <button type="button" className="feed-image-thumb-remove" onClick={() => removeImage(img.id)} aria-label="이미지 제거">×</button>
                </div>
              ))}
              {images.length < MAX_IMAGES ? (
                <button type="button" className="feed-image-slot" onClick={() => fileInputRef.current?.click()} aria-label="이미지 추가">+</button>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => {
                addImageFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {!isEdit ? (
              <>
                <p style={{ fontSize: '0.85rem', margin: '1rem 0 0.25rem' }}>링크 첨부 (선택)</p>
                {linkBarOpen ? (
                  <div className="feed-compose-link-fetch">
                    <input
                      type="url"
                      className="feed-compose-link-url-input"
                      placeholder="https://..."
                      value={linkUrlDraft}
                      onChange={(e) => setLinkUrlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void loadLinkPreview();
                        }
                      }}
                    />
                    <button type="button" className="feed-btn-outline" disabled={linkFetchBusy} onClick={() => void loadLinkPreview()}>
                      {linkFetchBusy ? '불러오는 중…' : '미리보기'}
                    </button>
                  </div>
                ) : null}
                {linkFetchError ? (
                  <p className="feed-compose-error" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                    {linkFetchError}
                  </p>
                ) : null}
                {linkPreview?.url ? (
                  <div className="feed-compose-link-preview-card">
                    {linkPreview.image ? (
                      <div className="feed-compose-link-preview-thumb">
                        <img src={linkPreview.image} alt="" />
                      </div>
                    ) : null}
                    <div className="feed-compose-link-preview-body">
                      <strong>{linkPreview.title}</strong>
                      {linkPreview.description ? <p>{linkPreview.description}</p> : null}
                      <span className="feed-compose-link-preview-host">
                        {(() => {
                          try {
                            return new URL(linkPreview.url).hostname;
                          } catch {
                            return linkPreview.url;
                          }
                        })()}
                      </span>
                    </div>
                    <button type="button" className="feed-compose-link-remove" onClick={() => setLinkPreview(null)} aria-label="링크 제거">
                      ×
                    </button>
                  </div>
                ) : null}

              </>
            ) : null}
          </div>
        </div>

        {submitError ? <div className="feed-compose-error">{submitError}</div> : null}

        <div className="feed-modal-footer">
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button type="button" className="feed-btn-outline" onClick={insertCodeBlockAtCursor}>코드 블록</button>
            <button
              type="button"
              className="feed-btn-outline"
              disabled={isEdit}
              onClick={() => {
                if (isEdit) return;
                setLinkBarOpen((o) => !o);
                setLinkFetchError('');
              }}
            >
              링크
            </button>
          </div>
          <button type="button" className="feed-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
            {loading ? (
              <>
                <span className="feed-spinner" aria-hidden />
                전송 중…
              </>
            ) : isEdit ? '저장하기' : '게시하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

