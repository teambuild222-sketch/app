import React, { useMemo, useState, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import {
  Bell,
  Calendar,
  Check,
  Handshake,
  Heart,
  MessageCircle,
  Rocket,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationDto } from '../api/types';
import { respondDabUp } from '../api/socialApi';
import {
  getPeopleCacheVersion,
  resolveOrganizer,
  subscribePeopleCache,
} from './ExplorePage/exploreEvents';
import './NotificationsList.css';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 45_000) return 'now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

type Kind = 'request' | 'dab' | 'booster' | 'club' | 'like' | 'comment' | 'event' | 'badge' | 'default';
type Filter = 'all' | 'requests' | 'boosters' | 'clubs';

function notifKind(data: Record<string, string>): Kind {
  const t = (data?.type ?? '').toLowerCase();
  if (t === 'dab_up_request') return 'request';
  if (t.includes('dab')) return 'dab';
  if (t.includes('follow') || t.includes('boost')) return 'booster';
  if (t.startsWith('club')) return 'club';
  if (t.includes('like')) return 'like';
  if (t.includes('comment')) return 'comment';
  if (t.includes('join') || t.includes('event')) return 'event';
  if (t.includes('badge') || t.includes('achievement')) return 'badge';
  return 'default';
}

const KIND_ICON: Record<Kind, LucideIcon> = {
  request: Handshake,
  dab: Handshake,
  booster: Rocket,
  club: Users,
  like: Heart,
  comment: MessageCircle,
  event: Calendar,
  badge: Sparkles,
  default: Bell,
};

const FILTERS: Array<{ id: Filter; label: string; kinds?: Kind[] }> = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Dab Ups', kinds: ['request', 'dab'] },
  { id: 'boosters', label: 'Boosters', kinds: ['booster'] },
  { id: 'clubs', label: 'Clubs', kinds: ['club'] },
];

type RequestState = 'accepted' | 'denied';

type Props = {
  items: NotificationDto[];
  onOpen?: (n: NotificationDto) => void;
  /** Called after a Dab Up request was confirmed or denied inline. */
  onChanged?: () => void;
  showFilters?: boolean;
};

/** Notifications feed: dab ups (with Confirm / Deny), boosters, club updates, likes, joins. */
export const NotificationsList: React.FC<Props> = ({ items, onOpen, onChanged, showFilters = false }) => {
  useSyncExternalStore(subscribePeopleCache, getPeopleCacheVersion);
  const [filter, setFilter] = useState<Filter>('all');
  const [resolved, setResolved] = useState<Record<string, RequestState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const withKinds = useMemo(
    () => items.map((n) => ({ n, kind: notifKind(n.data ?? {}) })),
    [items],
  );

  const visible = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter);
    if (!active?.kinds) return withKinds;
    return withKinds.filter(({ kind }) => active.kinds!.includes(kind));
  }, [withKinds, filter]);

  const pendingRequests = withKinds.filter(
    ({ n, kind }) => kind === 'request' && !n.data?.status && !resolved[n.id],
  ).length;

  const respond = (n: NotificationDto, accept: boolean) => {
    const userId = n.data?.userId;
    if (!userId || busyId) return;
    setBusyId(n.id);
    void respondDabUp(userId, accept)
      .then(() => {
        setResolved((prev) => ({ ...prev, [n.id]: accept ? 'accepted' : 'denied' }));
        toast.success(accept ? "You're dabbed up!" : 'Request declined');
        onChanged?.();
      })
      .catch(() => toast.error('That request is no longer available'))
      .finally(() => setBusyId(null));
  };

  const filterBar = showFilters && items.length > 0 && (
    <div className="notif-filters" role="tablist" aria-label="Filter notifications">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={filter === f.id}
          className={`notif-filter-chip${filter === f.id ? ' active' : ''}`}
          onClick={() => setFilter(f.id)}
        >
          {f.label}
          {f.id === 'requests' && pendingRequests > 0 && (
            <span className="notif-filter-count">{pendingRequests}</span>
          )}
        </button>
      ))}
    </div>
  );

  if (visible.length === 0) {
    return (
      <>
        {filterBar}
        <div className="notif-empty">
          <div className="notif-empty-icon">
            <Bell size={26} strokeWidth={1.75} />
          </div>
          <h3>All caught up</h3>
          <p>
            {filter === 'all'
              ? 'Dab ups, new boosters, club updates and likes will show up here.'
              : 'Nothing here yet.'}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {filterBar}
      <div className="notif-list">
        {visible.map(({ n, kind }) => {
          const Icon = KIND_ICON[kind];
          const userId = n.data?.userId;
          const person = userId ? resolveOrganizer(userId) : null;
          const requestState = (resolved[n.id] ?? n.data?.status) as RequestState | undefined;
          const isOpenRequest = kind === 'request' && !requestState && Boolean(userId);
          const open = () => onOpen?.(n);

          return (
            <div
              key={n.id}
              className={`notif-card kind-${kind}${n.read ? '' : ' unread'}`}
              onClick={open}
              onKeyDown={(e) => {
                if (onOpen && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  open();
                }
              }}
              role={onOpen ? 'button' : undefined}
              tabIndex={onOpen ? 0 : undefined}
            >
              <div className="notif-avatar-wrap">
                {person ? (
                  <img className="notif-avatar" src={person.avatar} alt="" loading="lazy" />
                ) : (
                  <div className={`notif-icon-wrap kind-${kind}`}>
                    <Icon size={18} strokeWidth={2} />
                  </div>
                )}
                {person && (
                  <span className={`notif-kind-badge kind-${kind}`}>
                    <Icon size={10} strokeWidth={2.5} />
                  </span>
                )}
              </div>

              <div className="notif-body">
                <div className="notif-top-row">
                  <span className="notif-label">{n.title || 'SIMSOR'}</span>
                  <span className="notif-time">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="notif-text">{n.body}</p>

                {isOpenRequest && (
                  <div className="notif-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="notif-action-btn confirm"
                      disabled={busyId === n.id}
                      onClick={() => respond(n, true)}
                    >
                      <Check size={14} strokeWidth={2.5} />
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="notif-action-btn"
                      disabled={busyId === n.id}
                      onClick={() => respond(n, false)}
                    >
                      <X size={14} strokeWidth={2.5} />
                      Deny
                    </button>
                  </div>
                )}
                {kind === 'request' && requestState && (
                  <span className={`notif-status ${requestState}`}>
                    {requestState === 'accepted' ? 'Dabbed up' : 'Declined'}
                  </span>
                )}
              </div>

              {!n.read && <span className="notif-unread-dot" aria-hidden />}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default NotificationsList;
