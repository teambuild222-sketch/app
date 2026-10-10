import React, { useState } from 'react';
import { User, ArrowRight, Sparkles, Scan, X } from 'lucide-react';
import PasswordInput from './PasswordInput';
import SocialLoginButtons from './SocialLoginButtons';
import { loginWithPassword } from '../../api';
import { isBackendEnabled } from '../../api/client';
import { forgotPassword, resetPassword } from '../../api/trustApi';
import { signInWithGoogle, getGoogleClientId } from '../../api/googleAuth';
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
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  // Quick-fill credentials for effortless testing
  const handleQuickFill = (e: React.MouseEvent) => {
    e.preventDefault();
    setUsername('admin');
    setPassword('admin');
    setError('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await loginWithPassword(username, password);
      window.location.href = '/';
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : 'Invalid username or password');
    }
  };

  // Simulate Face ID authentication
  const handleFaceIDClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setShowFaceIDScan(true);
    setFaceIDSuccess(false);

    setTimeout(async () => {
      setFaceIDSuccess(true);
      setTimeout(async () => {
        try {
          await loginWithPassword('admin', 'admin');
          localStorage.setItem('simsor-fullname', 'Admin User');
          window.location.href = '/';
        } catch {
          setShowFaceIDScan(false);
          setError('Face ID verification failed');
        }
      }, 900);
    }, 1400);
  };

  return (
    <div className="simsor-login-container">
      {/* Section greeting */}
      <div className="simsor-card-header">
        <h2 className="simsor-card-title">Welcome back</h2>
        <p className="simsor-card-subtitle">Sign in to your Simsor account</p>
      </div>

      {error && (
        <div className="simsor-auth-error animate-shake">
          <span>{error}</span>
        </div>
      )}

      {/* Main Login Form */}
      <form onSubmit={handleLoginSubmit} className="simsor-login-form">
        <div className="simsor-field-group">
          <label className="simsor-field-label" htmlFor="username">
            Username
          </label>
          <div className="ios-input-wrapper">
            <div className="ios-input-icon-left">
              <User size={17} />
            </div>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. aditya or admin"
              className="ios-input-field"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
            {username && (
              <button
                type="button"
                className="ios-clear-btn"
                onClick={() => setUsername('')}
                tabIndex={-1}
                aria-label="Clear username"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="simsor-field-group">
          <label className="simsor-field-label" htmlFor="password">
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="Enter password"
          />
        </div>

        {/* Quick action row: Forgot password & Face ID */}
        <div className="simsor-login-helpers">
          <button
            type="button"
            className="simsor-text-link"
            onClick={() => {
              if (!isBackendEnabled()) {
                alert('Connect VITE_API_URL to use live password reset.');
                return;
              }
              setForgotOpen(true);
              setForgotMessage('');
            }}
          >
            Forgot password?
          </button>

          <button
            type="button"
            className="simsor-faceid-pill"
            onClick={handleFaceIDClick}
            aria-label="Fast sign in with Face ID"
            title="Fast sign in with Face ID"
          >
            <Scan size={14} className="simsor-faceid-icon" />
            <span>Face ID</span>
          </button>
        </div>

        {/* Primary Submit Button */}
        <button
          type="submit"
          className={`simsor-primary-btn ${isLoading ? 'is-loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="simsor-btn-spinner" />
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight size={17} className="simsor-btn-arrow" />
            </>
          )}
        </button>
      </form>

      {/* Social Divider */}
      <div className="simsor-divider">
        <span>or</span>
      </div>

      {/* Social options */}
      <SocialLoginButtons
        onSelect={(provider) => {
          if (provider === 'google') {
            if (!isBackendEnabled()) {
              alert('Set VITE_API_URL to use Google sign-in.');
              return;
            }
            if (!getGoogleClientId()) {
              alert('Add VITE_GOOGLE_CLIENT_ID to frontend/.env.');
              return;
            }
            setIsLoading(true);
            void signInWithGoogle()
              .then(() => {
                window.location.href = '/';
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : 'Google sign-in failed');
                setIsLoading(false);
              });
            return;
          }
          alert('Sign in with Apple is available on the iOS app build.');
        }}
      />

      {/* Quick Test Demo chip */}
      <div className="simsor-demo-quickfill">
        <button type="button" className="simsor-demo-chip" onClick={handleQuickFill}>
          <Sparkles size={12} className="simsor-demo-sparkle" />
          <span>Quick fill: admin / admin</span>
        </button>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="simsor-modal-overlay" onClick={() => setForgotOpen(false)}>
          <div className="simsor-modal-card animate-scaleUp" onClick={(e) => e.stopPropagation()}>
            <div className="simsor-modal-head">
              <h3>Reset Password</h3>
              <button
                type="button"
                className="simsor-modal-close"
                onClick={() => setForgotOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {forgotMessage && <p className="simsor-modal-note">{forgotMessage}</p>}

            {!resetToken ? (
              <div className="simsor-modal-body">
                <p className="simsor-modal-desc">
                  Enter the email address registered with your account to receive a reset code.
                </p>
                <input
                  type="email"
                  className="simsor-modal-input"
                  placeholder="name@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="simsor-primary-btn"
                  onClick={() => {
                    if (!resetEmail.trim()) return;
                    void forgotPassword(resetEmail.trim())
                      .then((res) => {
                        if (res.resetToken) {
                          setResetToken(res.resetToken);
                          setForgotMessage('Dev mode: token ready. Set your new password below.');
                        } else {
                          setForgotMessage('If that account exists, a reset link was sent.');
                        }
                      })
                      .catch(() => setForgotMessage('Could not start reset — please verify email.'));
                  }}
                >
                  Send Reset Link
                </button>
              </div>
            ) : (
              <div className="simsor-modal-body">
                <input
                  type="text"
                  className="simsor-modal-input"
                  placeholder="Reset token"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                />
                <input
                  type="password"
                  className="simsor-modal-input"
                  placeholder="New password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="simsor-primary-btn"
                  onClick={() => {
                    void resetPassword(resetToken.trim(), newPassword)
                      .then(() => {
                        setForgotOpen(false);
                        setResetToken('');
                        setNewPassword('');
                        setForgotMessage('');
                        alert('Password updated successfully. You can now log in.');
                      })
                      .catch(() => setForgotMessage('Reset failed — token may be expired.'));
                  }}
                >
                  Save New Password
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Holographic Face ID Scan Overlay */}
      {showFaceIDScan && (
        <div className="simsor-faceid-overlay" onClick={() => setShowFaceIDScan(false)}>
          <div className="simsor-faceid-modal animate-scaleUp" onClick={(e) => e.stopPropagation()}>
            <div className={`simsor-faceid-glyph-wrap ${faceIDSuccess ? 'is-success' : 'is-scanning'}`}>
              <div className="simsor-faceid-radar" />
              <Scan size={44} className="simsor-faceid-scan-icon" />
            </div>
            <p className="simsor-faceid-status">
              {faceIDSuccess ? 'Face Verified' : 'Verifying Identity...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
