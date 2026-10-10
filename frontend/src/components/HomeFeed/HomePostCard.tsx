import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  MessageCircle,
  MapPin,
  Lock,
  Globe,
  Repeat2,
  MoreVertical,
  Share2,
  Trash2,
  Sparkles,
  Star,
  UserPlus,
} from 'lucide-react';
import {
  type HomeFeedPost,
  getPostAuthor,
  getPostHost,
  isEventPast,
  getHostRating,
  fallbackImageFor,
  isMe,
} from './homeFeed';
import {
  type FeedReason,
  isFollowing as checkFollowing,
  toggleFollow,
  recordDwell,
  recordInteraction,
} from './feedAlgorithm';
import PostCountdown from './PostCountdown';
import PostComments from './PostComments';
import { usePeopleVersion } from '../../lib/usePeople';
import {
  isJoined as checkJoined,
  toggleJoinAsync,
  deletePublishedPost,
  isUserCreatedPost,
} from './publishContent';
import { isBackendEnabled } from '../../api/client';
import { createPost, toggleLike as toggleLikeRemote } from '../../api/postsApi';
import ConfirmDialog from '../common/ConfirmDialog';
import { getEventCategoryIconClassName, getEventCategoryIconSrc } from '../ExplorePage/eventMapIcons';
import { ensureEventChat, removeEventChat, deleteEventTranscript } from '../common/eventChats';
import './HomeFeed.css';

type HomePostCardProps = {
  post: HomeFeedPost;
  reason?: FeedReason;
  onViewHostProfile: (hostId: string) => void;
  onViewLocation: (post: HomeFeedPost) => void;
  onViewAuthorProfile: (authorId: string) => void;
  onFollowChange?: () => void;
  onPostDeleted?: () => void;
};

function reasonLabel(reason?: FeedReason): { icon: React.ReactNode; text: string } | null {
  if (!reason) return null;
  switch (reason.kind) {
    case 'interest':
      return { icon: <Sparkles size={11} />, text: `Because you like ${reason.label}` };
    case 'affinity':
      return { icon: <Sparkles size={11} />, text: `More ${reason.label} for you` };
    case 'popular':
      return { icon: <Sparkles size={11} />, text: 'Popular near you' };
    default:
      return null;
  }
}

export const HomePostCard: React.FC<HomePostCardProps> = ({
  post,
  reason,
  onViewHostProfile,
  onViewLocation,
  onViewAuthorProfile,
  onFollowChange,
  onPostDeleted,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments);
  usePeopleVersion(); // re-render when a real author's name/photo finishes loading
  const live = isBackendEnabled();
  const [liked, setLiked] = useState(() => post.likedByMe ?? false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [reposted, setReposted] = useState(false);
  const [following, setFollowing] = useState(() => checkFollowing(post.authorId));
  const [joined, setJoined] = useState(() => checkJoined(post.eventId));
  const [confirmJoinOpen, setConfirmJoinOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [captionClamped, setCaptionClamped] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const triedFallback = useRef(false);
  const cardRef = useRef<HTMLElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);

  // Dwell tracking – accumulate visible time and report it for affinity learning.
  const dwellStart = useRef<number | null>(null);
  const dwellTotal = useRef(0);

  const author = getPostAuthor(post);
  const host = getPostHost(post);
  const past = isEventPast(post);
  const badge = reasonLabel(reason);
  const isOwnPost = isMe(post.authorId);
  const canDelete = isUserCreatedPost(post);
  const { rating, count } = getHostRating(post);

  useEffect(() => {
    setCaptionExpanded(false);
  }, [post.id]);

  useEffect(() => {
    setLiked(post.likedByMe ?? false);
    setLikeCount(post.likes);
  }, [post.id, post.likedByMe, post.likes]);

  useEffect(() => {
    setCommentCount(post.comments);
  }, [post.id, post.comments]);

  useEffect(() => {
    if (captionExpanded) {
      setCaptionClamped(false);
      return;
    }
    const el = captionRef.current;
    if (!el) return;

    const check = () => setCaptionClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.caption, captionExpanded]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isMenuOpen]);

  // Track how long the post stays on screen (>=55% visible).
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const flush = () => {
      if (dwellStart.current !== null) {
        dwellTotal.current += performance.now() - dwellStart.current;
        dwellStart.current = null;
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (dwellStart.current === null) dwellStart.current = performance.now();
        } else {
          flush();
        }
      },
      { threshold: [0, 0.55, 1] },
    );

    observer.observe(el);

    return () => {
      flush();
      observer.disconnect();
      if (dwellTotal.current > 0) {
        recordDwell(post, dwellTotal.current);
        dwellTotal.current = 0;
      }
    };
  }, [post]);

  const closeMenu = () => setIsMenuOpen(false);

  const handleShare = async () => {
    closeMenu();
    const shareUrl = `${window.location.origin}${window.location.pathname}?event=${post.eventId}`;
    const shareText = `${post.eventTitle} · ${post.eventDateLabel}\n${post.eventLocation}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.eventTitle,
          text: shareText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      }
    } catch {
      /* user cancelled share sheet */
    }
  };

  const handleDelete = async () => {
    setConfirmDeleteOpen(false);
    closeMenu();
    if (await deletePublishedPost(post)) {
      removeEventChat(post.eventId);
      deleteEventTranscript(post.eventId);
      onPostDeleted?.();
    }
  };

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => count + (next ? 1 : -1));

    if (isBackendEnabled()) {
      toggleLikeRemote(post.id)
        .then((result) => {
          setLiked(result.liked);
          setLikeCount(result.likes);
        })
        .catch(() => {
          // revert optimistic update on failure
          setLiked(!next);
          setLikeCount((count) => count - (next ? 1 : -1));
        });
      return;
    }

    if (next) recordInteraction(post, 'like');
  };

  const handleLocation = () => {
    recordInteraction(post, 'location');
    onViewLocation(post);
  };

  const handleRepost = () => {
    setReposted((v) => {
      const next = !v;
      if (next) {
        recordInteraction(post, 'repost');
        if (isBackendEnabled()) {
          void createPost({
            eventId: post.eventId,
            type: post.type,
            caption: post.caption,
            image: post.image,
            videoUrl: post.videoUrl,
            visibility: post.visibility,
            isReshared: true,
            originalHostId: post.authorId,
            registrationType: post.registrationType,
            slotsTotal: post.slotsTotal,
            registrationDeadline: post.registrationDeadlineISO ?? undefined,
          }).catch(() => {
            setReposted(false);
          });
        }
      }
      return next;
    });
  };

  const handleFollow = () => {
    const now = toggleFollow(post.authorId);
    setFollowing(now);
    onFollowChange?.();
  };

  const handleJoin = () => {
    // Leaving needs no confirmation; joining asks the user to confirm first.
    if (joined) {
      void toggleJoinAsync(post.eventId).then((now) => {
        setJoined(now);
        if (!now) removeEventChat(post.eventId);
      });
      return;
    }
    setConfirmJoinOpen(true);
  };

  const confirmJoin = () => {
    void toggleJoinAsync(post.eventId).then((now) => {
      setJoined(now);
      if (now) {
        recordInteraction(post, 'join');
        ensureEventChat({
          eventId: post.eventId,
          title: post.eventTitle,
          category: post.category,
          avatar: author.avatar,
          hostName: author.name,
          hostId: post.authorId,
        });
        if ('vibrate' in navigator) navigator.vibrate?.(10);
      }
      setConfirmJoinOpen(false);
    });
  };

  const handleAuthor = () => {
    recordInteraction(post, 'openProfile');
    onViewAuthorProfile(post.authorId);
  };

  return (
    <article
      ref={cardRef}
      className={`home-post-card ${post.type === 'text' ? 'home-post-card--text' : ''} ${
        past ? 'home-post-card--past' : ''
      }`}
    >
      {badge && (
        <div className="home-post-reason">
          {badge.icon}
          {badge.text}
        </div>
      )}

      <header className="home-post-head">
        <button type="button" className="home-post-author" onClick={handleAuthor}>
          <img className="home-post-avatar" src={author.avatar} alt={author.name} />
          <span className="home-post-author-meta">
            <span className="home-post-author-name">{author.name}</span>
            <span className="home-post-subline">
              {post.isReshared && host ? (
                <>
                  <Repeat2 size={12} className="home-post-reshare-icon" />
                  reshared {host.name}
                </>
              ) : (
                author.role
              )}
              {!live && (
                <>
                  <span className="home-post-dot">•</span>
                  <span className="home-post-inline-rating" title={`${rating.toFixed(1)} from ${count} ratings`}>
                    <Star size={11} className="home-post-rating-star" fill="currentColor" />
                    <strong>{rating.toFixed(1)}</strong>
                    <span className="home-post-rating-count">({count})</span>
                  </span>
                </>
              )}
              <span className="home-post-dot">•</span>
              {post.postedAgo}
            </span>
          </span>
        </button>

        <div className="home-post-head-right">
          {isOwnPost ? (
            <span className="home-post-you-tag">You</span>
          ) : (
            <button
              type="button"
              className={`home-post-follow ${following ? 'is-following' : ''}`}
              onClick={handleFollow}
            >
              {following ? 'Boosting' : 'Boost'}
            </button>
          )}
          <span
            className={`home-post-visibility ${post.visibility}`}
            title={post.visibility === 'private' ? 'Private event' : 'Public event'}
          >
            {post.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
          </span>

          {isOwnPost && (
            <div className="home-post-more-wrap" ref={moreWrapRef}>
              <button
                type="button"
                className="home-post-more-btn"
                aria-label="Post options"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen((open) => !open);
                }}
              >
                <MoreVertical size={17} />
              </button>

              {isMenuOpen && (
                <div className="home-post-more-menu" role="menu">
                  <button type="button" className="home-post-more-item" role="menuitem" onClick={handleShare}>
                    <Share2 size={16} />
                    Share post
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      className="home-post-more-item home-post-more-item--danger"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        setConfirmDeleteOpen(true);
                      }}
                    >
                      <Trash2 size={16} />
                      Delete post
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="home-post-caption-wrap">
        <p
          ref={captionRef}
          className={`home-post-caption ${!captionExpanded ? 'is-clamped' : ''}`}
        >
          {post.caption}
        </p>
        {!captionExpanded && captionClamped && (
          <button
            type="button"
            className="home-post-caption-more"
            onClick={(e) => {
              e.stopPropagation();
              setCaptionExpanded(true);
            }}
          >
            +more
          </button>
        )}
      </div>

      {post.type === 'poster' && post.image && (
        <div className={`home-post-media ${imgLoaded ? 'is-loaded' : ''}`}>
          {imgFailed ? (
            <div className="home-post-media-fallback">
              <span className="home-post-media-fallback-title">{post.eventTitle}</span>
              <span className="home-post-media-fallback-sub">{post.category}</span>
            </div>
          ) : (
            <img
              src={post.image}
              alt={post.eventTitle}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={(e) => {
                if (!triedFallback.current) {
                  triedFallback.current = true;
                  e.currentTarget.src = fallbackImageFor(post.id);
                } else {
                  setImgFailed(true);
                }
              }}
            />
          )}
          {past && <span className="home-post-ended-badge">Event ended</span>}
        </div>
      )}

      {post.type === 'video' && post.videoUrl && (
        <div className="home-post-media is-loaded">
          <video src={post.videoUrl} controls playsInline preload="metadata" />
          {past && <span className="home-post-ended-badge">Event ended</span>}
        </div>
      )}

      {!past && <PostCountdown post={post} joined={joined} onToggleJoin={handleJoin} />}

      <button type="button" className="home-post-event-chip" onClick={handleLocation}>
        <span className="home-post-event-chip-icon" aria-hidden="true">
          <img
            src={getEventCategoryIconSrc(post.category)}
            alt=""
            className={getEventCategoryIconClassName(post.category)}
            loading="lazy"
            draggable={false}
          />
        </span>
        <span className="home-post-event-chip-copy">
          <span className="home-post-event-title">{post.eventTitle}</span>
          <span className="home-post-event-sub">
            {post.eventDateLabel} · {post.eventLocation}
          </span>
        </span>
        {post.type === 'text' && past && <span className="home-post-ended-tag">Ended</span>}
      </button>

      <footer className="home-post-actions">
        <button
          type="button"
          className={`home-post-action ${liked ? 'liked' : ''}`}
          onClick={handleLike}
        >
          <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
          {likeCount}
        </button>
        <button
          type="button"
          className={`home-post-action ${commentsOpen ? 'active' : ''}`}
          onClick={() => live && setCommentsOpen((v) => !v)}
          aria-expanded={commentsOpen}
        >
          <MessageCircle size={17} />
          {commentCount}
        </button>
        <button
          type="button"
          className={`home-post-action ${reposted ? 'reposted' : ''}`}
          onClick={handleRepost}
          title="Re-recommend to your followers"
        >
          <Repeat2 size={17} />
          {reposted ? 'Reposted' : 'Repost'}
        </button>
        <button
          type="button"
          className="home-post-action home-post-action--location"
          onClick={handleLocation}
        >
          <MapPin size={17} />
          Location
        </button>
      </footer>

      {live && commentsOpen && <PostComments postId={post.id} onCountChange={setCommentCount} />}

      <ConfirmDialog
        open={confirmDeleteOpen}
        icon={<Trash2 size={24} />}
        title="Delete this post?"
        message={
          <>
            This removes <strong>{post.eventTitle}</strong> from your feed and the Explore map.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmDialog
        open={confirmJoinOpen}
        icon={<UserPlus size={24} />}
        title="Join this event?"
        message={
          <>
            Confirm your spot for <strong>{post.eventTitle}</strong> on {post.eventDateLabel}.
          </>
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={confirmJoin}
        onCancel={() => setConfirmJoinOpen(false)}
      />
    </article>
  );
};

export default HomePostCard;
