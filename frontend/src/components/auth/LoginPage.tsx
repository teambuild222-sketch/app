import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Eye, EyeOff, Lock, Check } from 'lucide-react';
import PasswordInput from './PasswordInput';
import SocialLoginButtons from './SocialLoginButtons';
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
  const [showFaceIDScan, setShowFaceIDScan] = useState(false);
  const [faceIDSuccess, setFaceIDSuccess] = useState(false);
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

  // Simulate Face ID authentication
  const handleFaceIDClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowFaceIDScan(true);
    setFaceIDSuccess(false);

    // Dynamic scanning state
    setTimeout(() => {
      setFaceIDSuccess(true);
      
      // Success delay then login
      setTimeout(() => {
        localStorage.setItem('zenex-auth', 'true');
        localStorage.setItem('zenex-username', 'ritvik');
        localStorage.setItem('zenex-fullname', 'Ritvik Katakam');
        window.location.href = '/';
      }, 1000);
    }, 1800);
  };

  return (
    <div className="ios-auth-card-body">
      {/* Logo Section */}
      <div className="auth-logo-container">
        <img src="/logo.png" alt="ZENEX Logo" className="auth-logo" />
        <h1 className="auth-app-name">ZENEX</h1>
      </div>

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
              <User size={18} />
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
          
          <button 
            type="button" 
            className="ios-faceid-trigger-btn"
            onClick={handleFaceIDClick}
            aria-label="Authenticate with Face ID"
          >
            <div className="ios-faceid-icon-badge">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15.5h-2v-2h2v2zm0-4.5h-2V7h2v6z"/>
              </svg>
            </div>
            <span>Face ID</span>
          </button>
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

      {/* Face ID Overlay Mock */}
      {showFaceIDScan && (
        <div className="ios-faceid-overlay" onClick={() => setShowFaceIDScan(false)}>
          <div className="ios-faceid-modal animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className={`ios-faceid-glyph-wrapper ${faceIDSuccess ? 'success' : 'scanning'}`}>
              {/* Dynamic Scanning Ring */}
              <div className="ios-faceid-ring" />
              
              {/* Face ID Logo Vector */}
              <svg className="ios-faceid-glyph" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                {/* Face outline / sensors */}
                <path d="M25 35 C 25 25, 35 25, 35 25" />
                <path d="M65 25 C 65 25, 75 25, 75 35" />
                <path d="M25 65 C 25 75, 35 75, 35 75" />
                <path d="M75 65 C 75 75, 65 75, 65 75" />
                {/* Eyes */}
                <circle cx="38" cy="45" r="3" fill="currentColor" />
                <circle cx="62" cy="45" r="3" fill="currentColor" />
                {/* Nose / Mouth */}
                <path d="M50 40 L50 60 L45 60" />
                <path d="M38 68 Q50 78 62 68" strokeWidth="4" fill="none" />
              </svg>
            </div>
            <span className="ios-faceid-status-text">
              {faceIDSuccess ? 'Face ID Verified' : 'Scanning Face ID...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
