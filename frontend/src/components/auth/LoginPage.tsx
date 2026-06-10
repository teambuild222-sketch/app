import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import PasswordInput from './PasswordInput';
import SocialLoginButtons from './SocialLoginButtons';
import UserAvatar from './UserAvatar';
import './LoginPage.css';

interface LoginPageProps {
  onSendOTP?: (phone: string) => void;
  onGuestLogin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Handle pre-filling for testing
  const handlePreFill = (e: React.MouseEvent) => {
    e.preventDefault();
    setUsername('admin');
    setPassword('admin');
    setError('');
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');

    // Simulate verification
    setTimeout(() => {
      if (username.trim().length >= 3 && password.trim().length >= 3) {
        localStorage.setItem('zenex-auth', 'true');
        localStorage.setItem('zenex-username', username.trim());
        localStorage.setItem('zenex-fullname', username.trim() === 'admin' ? 'Admin User' : username.trim());
        window.location.href = '/';
      } else {
        setIsLoading(false);
        setError('Invalid username or password (must be at least 3 characters)');
      }
    }, 1500);
  };

  return (
    <div className="ios-auth-card-body">
      {/* Welcome Message */}
      <div className="ios-welcome-header">
        <h2 className="ios-welcome-title">Welcome Back 👋</h2>
        <p className="ios-welcome-subtitle">Continue your journey with Zenex</p>
      </div>

      {error && (
        <div className="ios-error-banner animate-bounceIn">
          <span>{error}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLoginSubmit} className="ios-auth-form">
        <div className="ios-form-group">
          <label className="ios-input-label" htmlFor="username">Username</label>
          <div className="ios-input-wrapper">
            <div className="ios-input-icon-left">
              {username ? (
                <UserAvatar username={username} size="sm" />
              ) : (
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '12px', color: '#999' }}>👤</span>
                </div>
              )}
            </div>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError('');
              }}
              placeholder="Enter username"
              className="ios-input-field"
              autoComplete="username"
            />
            {username && (
              <button 
                type="button" 
                className="ios-clear-btn" 
                onClick={() => setUsername('')}
                tabIndex={-1}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="ios-form-group">
          <label className="ios-input-label" htmlFor="password">Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="Enter password"
          />
        </div>

        {/* Links row */}
        <div className="ios-links-row">
          <a href="#forgot" className="ios-text-link" onClick={(e) => { e.preventDefault(); alert('Reset password link sent to admin/email.'); }}>
            Forgot Password?
          </a>
        </div>

        {/* Main Blue Apple-style Login Button */}
        <button 
          type="submit" 
          className={`ios-primary-btn ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="ios-spinner" />
          ) : (
            <>
              <span>Login</span>
              <div className="ios-btn-arrow">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </>
          )}
        </button>
      </form>



      {/* Divider */}
      <div className="ios-divider">
        <span>or continue with</span>
      </div>

      {/* Social options */}
      <SocialLoginButtons onSelect={(provider) => alert(`Connecting to ${provider}...`)} />

    </div>
  );
};

export default LoginPage;
