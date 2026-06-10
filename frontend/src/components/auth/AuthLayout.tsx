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

      <div className={`ios-auth-container ${activeTab === 'signup' ? 'signup-mode' : ''}`}>
        <div className={`ios-auth-card glass-card ${activeTab === 'signup' ? 'signup-card' : ''}`}>
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
