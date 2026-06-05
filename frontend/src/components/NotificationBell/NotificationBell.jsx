import { Bell } from 'lucide-react';
import './NotificationBell.css';

function NotificationBell({ count = 0 }) {
  return (
    <button className="notification-bell" aria-label={`Notifications${count > 0 ? `, ${count} unread` : ''}`}>
      <Bell className="notification-bell-icon" size={24} />
      {count > 0 && (
        <span className="notification-bell-badge">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export default NotificationBell;
