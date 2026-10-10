import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { addComment, deleteComment, listComments } from '../../api/commentsApi';
import type { CommentDto } from '../../api/types';
import { avatarOrInitial } from '../../lib/avatar';
import { getCurrentViewerId } from '../ExplorePage/exploreEvents';

type PostCommentsProps = {
  postId: string;
  onCountChange?: (count: number) => void;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 45_000) return 'now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Live comment thread for a post: loads on open, refreshes every few seconds. */
export const PostComments: React.FC<PostCommentsProps> = ({ postId, onCountChange }) => {
  const [comments, setComments] = useState<CommentDto[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;
  const viewerId = getCurrentViewerId();

  const load = useCallback(async () => {
    try {
      const items = await listComments(postId);
      setComments(items);
      countRef.current?.(items.length);
    } catch {
      setComments((prev) => prev ?? []);
    }
  }, [postId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const created = await addComment(postId, text);
      setDraft('');
      setComments((prev) => {
        const next = [...(prev ?? []), created];
        countRef.current?.(next.length);
        return next;
      });
    } catch {
      toast.error('Could not post your comment');
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteComment(postId, commentId);
      setComments((prev) => {
        const next = (prev ?? []).filter((c) => c.id !== commentId);
        countRef.current?.(next.length);
        return next;
      });
    } catch {
      toast.error('Could not delete the comment');
    }
  };

  return (
    <section className="home-post-comments" aria-label="Comments">
      {comments === null && <p className="home-post-comments-empty">Loading comments…</p>}
      {comments !== null && comments.length === 0 && (
        <p className="home-post-comments-empty">No comments yet. Say something!</p>
      )}
      <ul className="home-post-comments-list">
        {(comments ?? []).map((c) => (
          <li key={c.id} className="home-post-comment">
            <img src={avatarOrInitial(c.authorAvatar, c.authorName)} alt="" />
            <div className="home-post-comment-body">
              <span className="home-post-comment-head">
                <strong>{c.authorName}</strong>
                <small>
                  {c.authorUsername ? `@${c.authorUsername} · ` : ''}
                  {timeAgo(c.createdAt)}
                </small>
              </span>
              <p>{c.text}</p>
            </div>
            {c.authorId === viewerId && (
              <button
                type="button"
                className="home-post-comment-delete"
                aria-label="Delete comment"
                onClick={() => void remove(c.id)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="home-post-comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={1000}
          placeholder="Add a comment…"
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Add a comment"
        />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Post comment">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
};

export default PostComments;
