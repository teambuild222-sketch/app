import React from 'react';
import { Map, Home, Search, MessageSquare, User } from 'lucide-react';
import './Navbar.css';

export type TabType = 'explore' | 'home' | 'discover' | 'chat' | 'profile';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'explore' as TabType, label: 'Explore', icon: Map },
    { id: 'home' as TabType, label: 'Home', icon: Home },
    { id: 'discover' as TabType, label: 'Discover', icon: Search },
    { id: 'chat' as TabType, label: 'Chat', icon: MessageSquare },
    { id: 'profile' as TabType, label: 'Profile', icon: User },
  ];

  return (
    <nav className="bottom-navbar">
      <div className="navbar-brand">
        <img src="/logo.png" alt="ZENEX" className="navbar-logo" />
        <span className="navbar-app-name">ZENEX</span>
      </div>
      <div className="navbar-content">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              aria-label={item.label}
            >
              <div className="icon-wrapper">
                <Icon size={22} className="nav-icon" />
                {isActive && <div className="active-dot" />}
              </div>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default Navbar;
