import React from 'react';
import type { NotificationDto } from '../api/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 45_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Props = {
  items: NotificationDto[];
  onOpen?: (n: NotificationDto) => void;
};

/** Real notifications from the server (follows, likes, comments, joins, dab ups). */
export const NotificationsList: React.FC<Props> = ({ items, onOpen }) => {
  if (items.length === 0) {
    return (
      <div className="panel-notifications-list">
        <div className="panel-notif-item">
          <div className="panel-notif-info">
            <span className="panel-notif-text">Nothing yet. Likes, comments, follows and event joins show up here.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-notifications-list">
      {items.map((n) => (
        <div
          key={n.id}
          className={`panel-notif-item ${n.read ? '' : 'unread'}`}
          onClick={() => onOpen?.(n)}
          role={onOpen ? 'button' : undefined}
        >
          {!n.read && <div className="panel-notif-dot" />}
          <div className="panel-notif-info">
            <span className="panel-notif-text">
              {n.body.startsWith(n.title) ? n.body : (<><strong>{n.title}</strong> &middot; {n.body}</>)}
            </span>
            <span className="panel-notif-time">{timeAgo(n.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationsList;
