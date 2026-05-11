import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/hooks/useAuth';
import api from '../api/axios';

export default function ProfilePage() {
  // URL 파라미터에서 userId 추출 (/profile/:userId)
  const { userId } = useParams();
  const navigate = useNavigate();

  // 현재 로그인된 유저 정보 - 본인 프로필 여부 판단에 사용
  const { user: me } = useAuth();

  // 조회할 프로필 데이터 상태
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 본인 프로필인지 여부 - userId가 'me'이거나 로그인 유저 ID와 동일하면 true
  const isMyProfile = userId === 'me' || (me && me.user_id === parseInt(userId));

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);

        // 'me'로 접근하거나 본인 ID면 민감 정보 포함된 본인 전용 API 사용
        const endpoint = isMyProfile
          ? '/users/me/profile'
          : `/users/${userId}`;

        const { data } = await api.get(endpoint);
        setProfile(data);
      } catch (err) {
        // 404: 존재하지 않는 유저
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

      {/* 뒤로가기 버튼 */}
      <button style={styles.backBtn} onClick={() => navigate(-1)}>← 돌아가기</button>

      {/* 프로필 카드 */}
      <div style={styles.card}>

        {/* 상단: 아바타 + 기본 정보 */}
        <div style={styles.header}>
          {/* GitHub 아바타 이미지 */}
          <img
            src={profile.avatar_url || '/default-avatar.png'}
            alt="avatar"
            style={styles.avatar}
          />

          <div style={styles.headerInfo}>
            {/* 닉네임 */}
            <h1 style={styles.nickname}>{profile.nickname}</h1>

            {/* 국가 */}
            {profile.country && (
              <p style={styles.subText}>📍 {profile.country}</p>
            )}

            {/* 자기소개 */}
            {profile.bio && (
              <p style={styles.bio}>{profile.bio}</p>
            )}

            {/* 본인 프로필이면 이메일 표시 */}
            {isMyProfile && profile.email && (
              <p style={styles.subText}>✉️ {profile.email}</p>
            )}
          </div>
        </div>

        {/* 팔로워 / 팔로잉 수 */}
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
            {/* 현재 스트릭 일수 */}
            <span style={styles.statNum}>🔥 {profile.current_streak}일</span>
            <span style={styles.statLabel}>현재 스트릭</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            {/* 최대 스트릭 기록 */}
            <span style={styles.statNum}>🏆 {profile.max_streak}일</span>
            <span style={styles.statLabel}>최대 스트릭</span>
          </div>
        </div>

        {/* 기술 스택 태그 */}
        {profile.tech_stacks.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>기술 스택</h3>
            <div style={styles.tagRow}>
              {profile.tech_stacks.map((stack) => (
                <span key={stack} style={styles.tag}>{stack}</span>
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

        {/* 버튼 영역 - 본인/타인에 따라 다르게 표시 */}
        <div style={styles.btnRow}>
          {isMyProfile ? (
            // 본인 프로필: 프로필 수정 버튼 (추후 구현)
            <button style={styles.primaryBtn} disabled>
              프로필 수정 (준비 중)
            </button>
          ) : (
            // 타인 프로필: 팔로우 버튼 (추후 구현)
            <button style={styles.primaryBtn} disabled>
              팔로우 (준비 중)
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ── 스타일 상수 ──
// 전체 배경색 #0f1c36 (랜딩 페이지와 동일한 다크 테마)
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
  headerInfo: {
    flex: 1,
  },
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
  statNum: {
    fontSize: '1.1rem',
    fontWeight: '700',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.5)',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    background: 'rgba(255,255,255,0.15)',
  },
  section: {
    marginBottom: '24px',
  },
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
  tag: {
    background: 'rgba(78, 154, 241, 0.2)',
    border: '1px solid rgba(78, 154, 241, 0.4)',
    color: '#93c5fd',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '0.85rem',
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
};
