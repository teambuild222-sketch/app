import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../themeContext';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import './AuthLayout.css';

interface AuthLayoutProps {
  children?: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = () => {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = location.pathname === '/signup' ? 'signup' : 'login';

  const handleTabChange = (tab: 'login' | 'signup') => {
    if (tab === 'signup') {
      navigate('/signup');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="ios-auth-shell" data-theme="light">
      <div className="ios-bg-gradient-blob blob-blue" />
      <div className="ios-bg-gradient-blob blob-purple" />
      <div className="ios-bg-gradient-blob blob-pink" />

      <div className="ios-auth-container">
        <div className="ios-auth-card glass-card">
          <div className="ios-auth-card-header">
            <div>
              <div className="auth-header-logo-container">
                <img src="/logo.png" alt="ZENEX Logo" className="auth-header-logo" />
              </div>
              <p className="auth-logo-label">ZENEX</p>
              <h1 className="auth-welcome-title">Welcome to Zenex</h1>
              <p className="auth-welcome-copy">A modern social experience for sports, events, and communities.</p>
            </div>
            <button type="button" className="auth-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>

          <div className="ios-segmented-control-wrapper auth-tabs">
            <div className={`ios-segmented-indicator ${activeTab === 'signup' ? 'right' : 'left'}`} />
            <button
              type="button"
              className={`ios-segmented-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => handleTabChange('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`ios-segmented-btn ${activeTab === 'signup' ? 'active' : ''}`}
              onClick={() => handleTabChange('signup')}
            >
              Sign Up
            </button>
          </div>

          <div className="ios-auth-card-body-wrapper">
            {activeTab === 'login' ? (
              <LoginPage />
            ) : (
              <SignupPage onBackToLogin={() => handleTabChange('login')} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
