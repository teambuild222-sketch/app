import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import HomePostCard from '../HomeFeed/HomePostCard';
import DiscoverGridTile from './DiscoverGridTile';
import DiscoverPostScrollView from './DiscoverPostScrollView';
import {
  type HomeFeedPost,
  getPostAuthor,
} from '../HomeFeed/homeFeed';
import { getInitialFeedPosts, loadFeedPosts, LIVE_POSTS_CHANGED_EVENT } from '../HomeFeed/feedSource';
import { listUsers } from '../../api/usersApi';
import { LIVE_SYNC_EVENT } from '../../lib/useLiveSync';
import { usePeopleVersion } from '../../lib/usePeople';
import {
  FEED_CHANGED_EVENT,
  trackCategoryInteraction,
} from '../HomeFeed/feedAlgorithm';
import {
  DAB_UPS_CHANGED_EVENT,
  getDabUpStatus,
  sendDabUpRequest,
} from '../profile/profileData';
import { toast } from 'react-hot-toast';
import { isBackendEnabled } from '../../api/client';
import { requestDabUp } from '../../api/socialApi';
import {
  EVENT_ORGANIZERS,
  ME_AUTHOR_ID,
  cacheRemoteOrganizer,
  getCurrentViewerId,
  resolveOrganizer,
} from '../ExplorePage/exploreEvents';
import { isAllowedFeedCategory } from '../ExplorePage/eventMapIcons';
import './DiscoverPage.css';

const CATEGORIES = ['All', 'Sports', 'Entertainment'] as const;

function getDiscoverModalRoot(): HTMLElement {
  return document.querySelector('.mobile-app-screen') ?? document.body;
}

type DiscoverPageProps = {
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
  onViewOrganizerProfile: (organizerId: string) => void;
  onViewPostLocation: (post: HomeFeedPost) => void;
  feedVersion: number;
  onFollowChange: () => void;
};

function matchesCategory(post: HomeFeedPost, category: string): boolean {
  if (category === 'All') return true;
  return post.mainCategory === category;
}

function matchesSearch(post: HomeFeedPost, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const author = getPostAuthor(post);
  return (
    post.caption.toLowerCase().includes(q) ||
    post.eventTitle.toLowerCase().includes(q) ||
    post.category.toLowerCase().includes(q) ||
    post.eventLocation.toLowerCase().includes(q) ||
    author.name.toLowerCase().includes(q) ||
    author.username.toLowerCase().includes(q)
  );
}

export const DiscoverPage: React.FC<DiscoverPageProps> = ({
  activeCategory,
  onCategoryChange,
  onViewOrganizerProfile,
  onViewPostLocation,
  feedVersion,
  onFollowChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [followTick, setFollowTick] = useState(0);
  const [previewPost, setPreviewPost] = useState<HomeFeedPost | null>(null);
  const [scrollFeedPostId, setScrollFeedPostId] = useState<string | null>(null);

  usePeopleVersion();
  const [rawPosts, setRawPosts] = useState<HomeFeedPost[]>(() => getInitialFeedPosts());
  const [liveIds, setLiveIds] = useState<string[]>([]);

  // Real people to dab up with: everyone signed up (refreshed in the background).
  useEffect(() => {
    if (!isBackendEnabled()) return undefined;
    let cancelled = false;
    const load = () => {
      void listUsers()
        .then((users) => {
          if (cancelled) return;
          const me = getCurrentViewerId();
          const others = users.filter((u) => u.id !== me);
          others.forEach((u) => cacheRemoteOrganizer(u.id, u));
          setLiveIds((prev) => {
            const next = others.map((u) => u.id);
            return prev.join(',') === next.join(',') ? prev : next;
          });
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(LIVE_SYNC_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(LIVE_SYNC_EVENT, load);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFeedPosts()
      .then((posts) => {
        if (cancelled) return;
        setRawPosts((prev) => (JSON.stringify(prev) === JSON.stringify(posts) ? prev : posts));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feedVersion]);

  useEffect(() => {
    const onLive = () => {
      const next = getInitialFeedPosts();
      setRawPosts((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    window.addEventListener(LIVE_POSTS_CHANGED_EVENT, onLive);
    return () => window.removeEventListener(LIVE_POSTS_CHANGED_EVENT, onLive);
  }, []);

  const allPosts = useMemo(
    () => rawPosts.filter((post) => isAllowedFeedCategory(post.category)),
    [rawPosts],
  );

  const filteredPosts = useMemo(() => {
    void followTick;
    return allPosts.filter(
      (post) => matchesCategory(post, activeCategory) && matchesSearch(post, searchQuery),
    );
  }, [allPosts, activeCategory, searchQuery, followTick]);

  const recommendedPeople = useMemo(() => {
    void followTick;
    const pool = isBackendEnabled() ? liveIds.map((id) => resolveOrganizer(id)) : EVENT_ORGANIZERS;
    return pool.filter(
      (org) => org.id !== ME_AUTHOR_ID && getDabUpStatus(org.id) !== 'dabbed_up',
    ).slice(0, 8);
  }, [followTick, liveIds]);

  // Refresh cards when a pending Dab Up gets accepted.
  useEffect(() => {
    const onDabChange = () => {
      setFollowTick((v) => v + 1);
      onFollowChange();
    };
    window.addEventListener(DAB_UPS_CHANGED_EVENT, onDabChange);
    return () => window.removeEventListener(DAB_UPS_CHANGED_EVENT, onDabChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDabUp = (organizerId: string) => {
    if (getDabUpStatus(organizerId) !== 'none') return;
    const person = resolveOrganizer(organizerId);
    const run = async () => {
      if (isBackendEnabled()) {
        const status = await requestDabUp(organizerId);
        setFollowTick((v) => v + 1);
        if (status === 'dabbed_up') {
          toast.success(`You and ${person?.name ?? 'member'} are now Dabbed Up! ✅`);
        } else {
          toast(`Dab Up request sent to ${person?.name ?? 'member'} 🤝`);
        }
        return;
      }
      sendDabUpRequest(organizerId);
      setFollowTick((v) => v + 1);
      toast(`Dab Up request sent to ${person?.name ?? 'member'} 🤝`);
      const onAccepted = () => {
        if (getDabUpStatus(organizerId) === 'dabbed_up') {
          toast.success(`You and ${person?.name ?? 'member'} are now Dabbed Up! ✅`);
          window.removeEventListener(DAB_UPS_CHANGED_EVENT, onAccepted);
        }
      };
      window.addEventListener(DAB_UPS_CHANGED_EVENT, onAccepted);
    };
    void run();
    window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT));
  };

  useEffect(() => {
    if (!previewPost && !scrollFeedPostId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewPost(null);
        setScrollFeedPostId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewPost, scrollFeedPostId]);

  const bumpFollow = () => {
    setFollowTick((v) => v + 1);
    onFollowChange();
  };

  const handleTileOpen = (post: HomeFeedPost) => {
    trackCategoryInteraction(post.category, post.mainCategory, 'discover_tile_open', post.authorId);
    setScrollFeedPostId(post.id);
  };

  return (
    <div className="discover-page-view animate-fadeIn">
      <div className="discover-search-bar">
        <Search size={18} className="discover-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="discover-search-input"
          placeholder="Search posts, events, people..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search discover feed"
        />
      </div>

      <div className="discover-category-scroller">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`discover-category-chip ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => onCategoryChange(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {recommendedPeople.length > 0 && (
        <section className="discover-block">
          <div className="discover-section-label">Recommended to Dab Up</div>
          <div className="discover-people-row">
            {recommendedPeople.map((person) => (
              <article key={person.id} className="discover-person-card">
                <button
                  type="button"
                  className="discover-person-avatar-btn"
                  onClick={() => onViewOrganizerProfile(person.id)}
                >
                  <img src={person.avatar} alt={person.name} className="discover-person-avatar" />
                </button>
                <div className="discover-person-meta">
                  <button
                    type="button"
                    className="discover-person-name"
                    onClick={() => onViewOrganizerProfile(person.id)}
                  >
                    {person.name}
                  </button>
                  <span className="discover-person-role">{person.username ? `@${person.username}` : person.role}</span>
                </div>
                <button
                  type="button"
                  className={`discover-person-dap ${getDabUpStatus(person.id) === 'pending' ? 'is-pending' : ''}`}
                  onClick={() => handleDabUp(person.id)}
                  disabled={getDabUpStatus(person.id) !== 'none'}
                  aria-label={
                    getDabUpStatus(person.id) === 'pending'
                      ? `Dab Up pending with ${person.name}`
                      : `Dab Up with ${person.name}`
                  }
                >
                  {getDabUpStatus(person.id) === 'pending' ? 'Pending…' : 'Dab Up'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="discover-block">
        <div className="discover-section-label">
          {searchQuery.trim() ? 'Search results' : 'Posts & videos'}
        </div>

        {filteredPosts.length === 0 ? (
          <p className="discover-empty">No posts match your search or filter.</p>
        ) : (
          <div className="discover-post-grid">
            {filteredPosts.map((post) => (
              <DiscoverGridTile
                key={post.id}
                post={post}
                onClick={() => handleTileOpen(post)}
                onLongPress={() => setPreviewPost(post)}
              />
            ))}
          </div>
        )}
      </section>

      {scrollFeedPostId && (
        <DiscoverPostScrollView
          posts={filteredPosts}
          initialPostId={scrollFeedPostId}
          onClose={() => setScrollFeedPostId(null)}
          onViewOrganizerProfile={onViewOrganizerProfile}
          onViewPostLocation={onViewPostLocation}
          onFollowChange={bumpFollow}
        />
      )}

      {previewPost &&
        createPortal(
          <div
            className="discover-post-modal discover-overlay-theme"
            role="dialog"
            aria-modal="true"
            aria-label="Post preview"
            onClick={() => setPreviewPost(null)}
          >
            <div className="discover-post-modal-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="discover-post-modal-close"
                onClick={() => setPreviewPost(null)}
                aria-label="Close post"
              >
                <X size={20} />
              </button>
              <HomePostCard
                post={previewPost}
                onViewHostProfile={onViewOrganizerProfile}
                onViewAuthorProfile={onViewOrganizerProfile}
                onViewLocation={onViewPostLocation}
                onFollowChange={bumpFollow}
                onPostDeleted={() => {
                  setPreviewPost(null);
                  bumpFollow();
                }}
              />
            </div>
          </div>,
          getDiscoverModalRoot(),
        )}
    </div>
  );
};

export default DiscoverPage;
