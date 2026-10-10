import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, Sparkles } from 'lucide-react';
import { useTheme } from '../../themeContext';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import './AuthLayout.css';

export const AuthLayout: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = location.pathname === '/signup' ? 'signup' : 'login';

  const handleTabChange = (tab: 'login' | 'signup') => {
    navigate(tab === 'signup' ? '/signup' : '/login');
  };

  return (
    <div className="simsor-auth-shell">
      {/* Dynamic atmospheric mesh background */}
      <div className="simsor-auth-ambient" aria-hidden />

      <div className="simsor-auth-frame">
        {/* Top bar with quick theme toggle */}
        <header className="simsor-auth-topbar">
          <div className="simsor-auth-pill-badge">
            <Sparkles size={13} className="simsor-auth-badge-icon" />
            <span>Community Platform</span>
          </div>

          <button
            type="button"
            className="simsor-auth-theme-btn"
            onClick={toggleTheme}
            aria-label="Toggle light/dark theme"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} strokeWidth={2.2} /> : <Sun size={16} strokeWidth={2.2} />}
          </button>
        </header>

        {/* Central Brand Identity */}
        <div className="simsor-auth-hero">
          <div className="simsor-auth-logo-orbit">
            <div className="simsor-auth-logo-glow" aria-hidden />
            <div className="simsor-auth-logo-badge">
              <img src="/logo.png" alt="Simsor" className="simsor-auth-logo-img" />
            </div>
          </div>
          <h1 className="simsor-auth-brand-name">SIMSOR</h1>
          <p className="simsor-auth-brand-tagline">Sports · Events · Communities</p>
        </div>

        {/* Pill Segmented Switcher */}
        <div className="simsor-auth-pill-tabs" role="tablist" aria-label="Auth tabs">
          <div className={`simsor-auth-pill-slider ${activeTab === 'signup' ? 'is-signup' : 'is-login'}`} />
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'login'}
            className={`simsor-auth-pill-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => handleTabChange('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'signup'}
            className={`simsor-auth-pill-tab ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => handleTabChange('signup')}
          >
            Sign Up
          </button>
        </div>

        {/* Seamless Blended Form Panel */}
        <main className="simsor-auth-body">
          {activeTab === 'login' ? (
            <LoginPage />
          ) : (
            <SignupPage onBackToLogin={() => handleTabChange('login')} />
          )}
        </main>

        {/* Subtle footer credit */}
        <footer className="simsor-auth-footer">
          <span>Protected by Simsor Trust & Safety</span>
        </footer>
      </div>
    </div>
  );
};

export default AuthLayout;
