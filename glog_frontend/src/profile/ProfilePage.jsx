import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/hooks/useAuth';
import api from '../api/axios';

// 선택 가능한 기술 스택 목록
const TECH_STACK_OPTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift', 'Go', 'Rust', 'C++', 'C#',
  'React', 'Vue', 'Angular', 'Next.js', 'Svelte',
  'Node.js', 'Express', 'NestJS', 'Spring', 'Django', 'FastAPI',
  'React Native', 'Flutter',
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'GraphQL', 'Tailwind CSS', 'Git',
];

export default function ProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 수정 모드 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editTechStacks, setEditTechStacks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const isMyProfile = userId === 'me' || (me && me.user_id === parseInt(userId));

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const endpoint = isMyProfile ? '/users/me/profile' : `/users/${userId}`;
        const { data } = await api.get(endpoint);
        setProfile(data);
      } catch (err) {
        if (err.response?.status === 404) {
          setError('존재하지 않는 유저입니다.');
        } else {
          setError('프로필을 불러오지 못했습니다.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId, isMyProfile]);

  // 수정 시작 — 현재 프로필 값으로 편집 상태 초기화
  const handleEditStart = () => {
    setEditBio(profile.bio || '');
    setEditTechStacks(profile.tech_stacks || []);
    setSaveError(null);
    setIsEditing(true);
  };

  const MAX_STACKS = 5;

  // 기술 스택 태그 토글 — 이미 5개 선택된 상태에서 새 항목 추가 시 무시
  const toggleStack = (stack) => {
    setEditTechStacks((prev) => {
      if (prev.includes(stack)) return prev.filter((s) => s !== stack);
      if (prev.length >= MAX_STACKS) return prev; // 5개 초과 차단
      return [...prev, stack];
    });
  };

  // 저장 요청
  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      const { data } = await api.patch('/users/me/profile', {
        bio: editBio,
        tech_stacks: editTechStacks,
      });
      // 저장 성공 — 프로필 상태 업데이트 후 뷰 모드로 전환
      setProfile((prev) => ({ ...prev, bio: data.bio ?? editBio, tech_stacks: data.tech_stacks ?? editTechStacks }));
      setIsEditing(false);
    } catch (err) {
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div style={styles.center}>
      <p style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중...</p>
    </div>
  );

  if (error) return (
    <div style={styles.center}>
      <p style={{ color: '#f87171' }}>{error}</p>
      <button style={styles.backBtn} onClick={() => navigate(-1)}>← 돌아가기</button>
    </div>
  );

  return (
    <div style={styles.page}>
      {/* 수정 모드일 때는 수정 취소, 뷰 모드일 때는 이전 페이지로 */}
      <button
        style={styles.backBtn}
        onClick={isEditing ? () => setIsEditing(false) : () => navigate(-1)}
      >
        {isEditing ? '← 수정 취소' : '← 돌아가기'}
      </button>

      <div style={styles.card}>
        {/* 아바타 + 기본 정보 */}
        <div style={styles.header}>
          <img
            src={profile.avatar_url || '/default-avatar.png'}
            alt="avatar"
            style={styles.avatar}
          />
          <div style={styles.headerInfo}>
            <h1 style={styles.nickname}>{profile.nickname}</h1>
            {profile.country && (
              <p style={styles.subText}>📍 {profile.country}</p>
            )}

            {/* 수정 모드가 아닐 때만 bio 표시 */}
            {!isEditing && profile.bio && (
              <p style={styles.bio}>{profile.bio}</p>
            )}

            {isMyProfile && profile.email && (
              <p style={styles.subText}>✉️ {profile.email}</p>
            )}
          </div>
        </div>

        {/* 팔로워/팔로잉/스트릭 통계 */}
        <div style={styles.statsRow}>
          <div style={styles.statItem}>
            <span style={styles.statNum}>{profile.follower_count}</span>
            <span style={styles.statLabel}>팔로워</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <span style={styles.statNum}>{profile.following_count}</span>
            <span style={styles.statLabel}>팔로잉</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <span style={styles.statNum}>🔥 {profile.current_streak}일</span>
            <span style={styles.statLabel}>현재 스트릭</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <span style={styles.statNum}>🏆 {profile.max_streak}일</span>
            <span style={styles.statLabel}>최대 스트릭</span>
          </div>
        </div>

        {/* ── 수정 모드 ── */}
        {isEditing ? (
          <div style={styles.section}>
            {/* 자기소개 편집 */}
            <h3 style={styles.sectionTitle}>자기소개</h3>
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="자기소개를 입력해주세요"
              maxLength={200}
              style={styles.textarea}
            />
            <p style={styles.charCount}>{editBio.length} / 200</p>

            {/* 기술 스택 태그 선택 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 12 }}>
              <h3 style={{ ...styles.sectionTitle, margin: 0 }}>기술 스택</h3>
              {/* 선택 수 / 최대 표시 — 5개 초과 시 빨간색 */}
              <span style={{ fontSize: '0.8rem', color: editTechStacks.length >= MAX_STACKS ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                {editTechStacks.length} / {MAX_STACKS}
              </span>
              {editTechStacks.length >= MAX_STACKS && (
                <span style={{ fontSize: '0.78rem', color: '#f87171' }}>최대 5개까지 선택 가능합니다</span>
              )}
            </div>
            <div style={styles.tagRow}>
              {TECH_STACK_OPTIONS.map((stack) => {
                const selected = editTechStacks.includes(stack);
                // 선택되지 않았고 이미 5개인 경우 흐리게 표시
                const disabled = !selected && editTechStacks.length >= MAX_STACKS;
                return (
                  <button
                    key={stack}
                    onClick={() => toggleStack(stack)}
                    style={selected ? styles.tagSelected : disabled ? styles.tagDisabled : styles.tagUnselected}
                  >
                    {stack}
                  </button>
                );
              })}
            </div>

            {saveError && <p style={{ color: '#f87171', marginTop: 12, fontSize: '0.85rem' }}>{saveError}</p>}

            {/* 저장 / 취소 */}
            <div style={styles.btnRow}>
              <button style={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
              <button style={styles.cancelBtn} onClick={() => setIsEditing(false)} disabled={saving}>
                취소
              </button>
            </div>
          </div>
        ) : (
          /* ── 뷰 모드 ── */
          <>
            {/* 기술 스택 태그 표시 */}
            {profile.tech_stacks.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>기술 스택</h3>
                <div style={styles.tagRow}>
                  {profile.tech_stacks.map((stack) => (
                    <span key={stack} style={styles.tagDisplay}>{stack}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 코인 (본인만 표시) */}
            {isMyProfile && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>보유 코인</h3>
                <p style={styles.coins}>🪙 {profile.coins.toLocaleString()} coins</p>
              </div>
            )}

            {/* 버튼 영역 */}
            <div style={styles.btnRow}>
              {isMyProfile ? (
                <button style={styles.primaryBtn} onClick={handleEditStart}>
                  프로필 수정
                </button>
              ) : (
                <button style={styles.primaryBtn} disabled>
                  팔로우 (준비 중)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f1c36',
    color: 'white',
    fontFamily: 'sans-serif',
    padding: '40px 60px',
  },
  center: {
    minHeight: '100vh',
    background: '#0f1c36',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  backBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.3)',
    color: 'rgba(255,255,255,0.7)',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginBottom: '32px',
  },
  card: {
    maxWidth: '680px',
    margin: '0 auto',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    padding: '40px',
  },
  header: {
    display: 'flex',
    gap: '28px',
    alignItems: 'flex-start',
    marginBottom: '32px',
  },
  avatar: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.2)',
    objectFit: 'cover',
  },
  headerInfo: { flex: 1 },
  nickname: {
    fontSize: '1.8rem',
    fontWeight: '800',
    margin: '0 0 8px 0',
  },
  bio: {
    fontSize: '0.95rem',
    color: 'rgba(255,255,255,0.7)',
    margin: '6px 0',
    lineHeight: '1.5',
  },
  subText: {
    fontSize: '0.85rem',
    color: 'rgba(255,255,255,0.5)',
    margin: '4px 0',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '20px 0',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    marginBottom: '28px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  statNum: { fontSize: '1.1rem', fontWeight: '700' },
  statLabel: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' },
  statDivider: {
    width: '1px',
    height: '32px',
    background: 'rgba(255,255,255,0.15)',
  },
  section: { marginBottom: '24px' },
  sectionTitle: {
    fontSize: '0.9rem',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tagDisplay: {
    background: 'rgba(78, 154, 241, 0.2)',
    border: '1px solid rgba(78, 154, 241, 0.4)',
    color: '#93c5fd',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '0.85rem',
  },
  tagSelected: {
    background: 'rgba(78, 154, 241, 0.4)',
    border: '1px solid rgba(78, 154, 241, 0.8)',
    color: '#bfdbfe',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontWeight: '600',
  },
  tagUnselected: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.5)',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  tagDisabled: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.2)',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    cursor: 'not-allowed',
  },
  textarea: {
    width: '100%',
    minHeight: '100px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '10px',
    color: 'white',
    fontSize: '0.95rem',
    padding: '12px',
    resize: 'vertical',
    fontFamily: 'sans-serif',
    lineHeight: '1.5',
    boxSizing: 'border-box',
  },
  charCount: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'right',
    margin: '4px 0 0',
  },
  coins: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#fbbf24',
  },
  btnRow: {
    marginTop: '28px',
    display: 'flex',
    gap: '12px',
  },
  primaryBtn: {
    background: 'white',
    color: '#0f1c36',
    border: 'none',
    padding: '12px 28px',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'none',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.25)',
    padding: '12px 28px',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
  },
};
