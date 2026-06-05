import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, Home, Search, MessageCircle, User } from 'lucide-react';
import './BottomNav.css';

const tabs = [
  { label: 'Explore', icon: Compass, path: '/explore' },
  { label: 'Home', icon: Home, path: '/' },
  { label: 'Discover', icon: Search, path: '/discover' },
  { label: 'Chat', icon: MessageCircle, path: '/chat' },
  { label: 'Profile', icon: User, path: '/profile' },
];

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        const Icon = tab.icon;

        return (
          <button
            key={tab.path}
            className={`bottom-nav-tab${isActive ? ' active' : ''}`}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav-indicator" />
            <Icon className="bottom-nav-icon" size={24} />
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
