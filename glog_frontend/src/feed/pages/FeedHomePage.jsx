import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import FeedTabs from '../components/FeedTabs';
import FeedSortAndTheme from '../components/FeedSortAndTheme';
import FeedList from '../components/FeedList';

export default function FeedHomePage() {
  const { user } = useAuth();
  const { setComposeOpen } = useOutletContext();
  const [sortOrder, setSortOrder] = useState('latest');
  const [prependPosts, setPrependPosts] = useState([]);

  useEffect(() => {
    const onNew = (e) => {
      const post = e.detail;
      if (!post?.id) return;
      setPrependPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
    };
    window.addEventListener('glog:new-post', onNew);
    return () => window.removeEventListener('glog:new-post', onNew);
  }, []);

  return (
    <>
      <div className="feed-tabs">
        <FeedTabs />
        <FeedSortAndTheme sortValue={sortOrder} onSortChange={setSortOrder} />
      </div>
      {user ? (
        <div className="feed-card feed-composer">
          <div className="feed-avatar feed-avatar-sm" aria-hidden />
          <div className="feed-input-area">
            <textarea placeholder="무슨 작업 중인가요?" readOnly onFocus={() => setComposeOpen()} onClick={() => setComposeOpen()} />
            <div className="feed-composer-actions">
              <div className="feed-composer-tools">
                <button type="button" className="feed-btn-outline" onClick={() => setComposeOpen({ initialAction: 'image' })}>
                  이미지
                </button>
                <button type="button" className="feed-btn-outline" onClick={() => setComposeOpen({ initialAction: 'code' })}>
                  코드
                </button>
                <button type="button" className="feed-btn-outline" onClick={() => setComposeOpen()}>
                  링크
                </button>
                <button type="button" className="feed-btn-outline" onClick={() => setComposeOpen()}>
                  투표
                </button>
              </div>
              <button type="button" className="feed-btn-primary" onClick={() => setComposeOpen()}>
                게시하기
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="feed-card feed-empty" style={{ textAlign: 'left', padding: '1.15rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>로그인하면 글을 작성할 수 있어요</h2>
          <p className="feed-post-meta" style={{ marginTop: '0.4rem' }}>
            GitHub 계정으로 로그인 후 본문/이미지/코드 블록을 작성하세요.
          </p>
          <Link to="/" className="feed-btn-primary" style={{ display: 'inline-block', marginTop: '0.65rem', textDecoration: 'none' }}>
            GitHub으로 로그인
          </Link>
        </div>
      )}
      <FeedList feedType="all" sortOrder={sortOrder} prependPosts={prependPosts} />
    </>
  );
}
