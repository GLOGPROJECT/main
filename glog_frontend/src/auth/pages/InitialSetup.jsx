import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../../api/axios';

const TECH_STACK_OPTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#',
  'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'Node.js', 'Express',
  'NestJS', 'Spring', 'Django', 'FastAPI', 'Flutter', 'Swift', 'Kotlin',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'MySQL', 'PostgreSQL',
  'MongoDB', 'Redis', 'GraphQL', 'TypeORM', 'Prisma',
];

const COUNTRY_OPTIONS = [
  { code: '', label: '선택 안 함' },
  { code: 'KR', label: '🇰🇷 대한민국' },
  { code: 'US', label: '🇺🇸 미국' },
  { code: 'JP', label: '🇯🇵 일본' },
  { code: 'CN', label: '🇨🇳 중국' },
  { code: 'GB', label: '🇬🇧 영국' },
  { code: 'DE', label: '🇩🇪 독일' },
  { code: 'FR', label: '🇫🇷 프랑스' },
  { code: 'CA', label: '🇨🇦 캐나다' },
  { code: 'AU', label: '🇦🇺 호주' },
  { code: 'IN', label: '🇮🇳 인도' },
  { code: 'BR', label: '🇧🇷 브라질' },
];

export default function InitialSetup() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [selectedStacks, setSelectedStacks] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleStack(stack) {
    setSelectedStacks((prev) => {
      if (prev.includes(stack)) return prev.filter((s) => s !== stack);
      if (prev.length >= 5) return prev;
      return [...prev, stack];
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/auth/setup', {
        country: country || null,
        bio: bio || null,
        tech_stacks: selectedStacks,
      });
      updateUser({ is_setup_complete: true, country, bio, tech_stacks: selectedStacks, globe_lat: data.globe_lat, globe_lon: data.globe_lon });
      navigate('/globe', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || '오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px' }}>
      <h2>Glog 초기 설정</h2>
      <p>지구본 위에 캐릭터를 생성하기 위한 간단한 설정이에요.</p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <label>
            <strong>나라 선택</strong> <span style={{ color: '#888' }}>(선택사항)</span>
          </label>
          <br />
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ marginTop: 8, padding: '8px', width: '100%' }}>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>
            <strong>한 줄 소개</strong> <span style={{ color: '#888' }}>(선택사항, 최대 100자)</span>
          </label>
          <br />
          <input
            type="text"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 100))}
            placeholder="간단한 자기소개를 입력해주세요"
            style={{ marginTop: 8, padding: '8px', width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ textAlign: 'right', fontSize: 12, color: '#888' }}>{bio.length}/100</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>
            <strong>주요 기술 스택</strong>{' '}
            <span style={{ color: '#888' }}>(선택사항, 최대 5개 / 선택: {selectedStacks.length}/5)</span>
          </label>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TECH_STACK_OPTIONS.map((stack) => {
              const selected = selectedStacks.includes(stack);
              return (
                <button
                  key={stack}
                  type="button"
                  onClick={() => toggleStack(stack)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: selected ? '2px solid #0070f3' : '1px solid #ccc',
                    backgroundColor: selected ? '#e6f0ff' : '#fff',
                    cursor: 'pointer',
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {stack}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '설정 중...' : '🌍 지구본에 캐릭터 생성하기'}
        </button>
      </form>
    </div>
  );
}
