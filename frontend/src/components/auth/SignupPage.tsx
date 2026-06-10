import React, { useState, useMemo } from 'react';
import { User, Mail, Phone, Lock, Check, ArrowRight } from 'lucide-react';
import PasswordInput from './PasswordInput';
import UserAvatar from './UserAvatar';
import './SignupPage.css';

interface SignupPageProps {
  onBackToLogin: () => void;
}

const takenUsernames = ['zenex', 'admin', 'support', 'team', 'guest'];

const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

export const SignupPage: React.FC<SignupPageProps> = ({ onBackToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const emailValid = validateEmail(email);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordValid = password.length >= 8 && passwordsMatch;
  const isFormValid =
    fullName.trim().length > 1 &&
    username.trim().length > 2 &&
    emailValid &&
    phone.trim().length > 5 &&
    passwordValid &&
    agreeTerms;

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setError('Please complete the form with valid information.');
      return;
    }

    setError('');
    setIsLoading(true);

    setTimeout(() => {
      localStorage.setItem('zenex-auth', 'true');
      localStorage.setItem('zenex-username', username.trim());
      localStorage.setItem('zenex-fullname', fullName.trim());
      window.location.href = '/';
    }, 1400);
  };

  const handleGoogleOAuth = () => {
    setError('');
    setIsGoogleLoading(true);

    setTimeout(() => {
      localStorage.setItem('zenex-auth', 'true');
      localStorage.setItem('zenex-username', 'google-user');
      localStorage.setItem('zenex-fullname', 'Google User');
      window.location.href = '/';
    }, 1500);
  };

  return (
    <div className="signup-page-shell">
      <section className="signup-form-panel">
        <div className="signup-intro-copy">
          <p className="signup-eyebrow">Create Your Account 🎉</p>
        </div>

          <button
            type="button"
            className={`google-button ${isGoogleLoading ? 'loading' : ''}`}
            onClick={handleGoogleOAuth}
            disabled={isGoogleLoading}
          >
            <span className="google-icon-wrapper">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.47 14.98 1 12 1 7.35 1 3.37 3.75 1.58 7.75l3.86 3C6.38 7.74 8.97 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.45 12.3c0-.82-.07-1.6-.2-2.3H12v4.38h6.42c-.28 1.44-1.1 2.66-2.33 3.48l3.63 2.82c2.13-1.96 3.35-4.85 3.35-8.38z" />
                <path fill="#FBBC05" d="M5.44 14.75c-.24-.72-.38-1.5-.38-2.3s.14-1.58.38-2.3L1.58 7.15C.57 9.17 0 11.48 0 13.9s.57 4.73 1.58 6.75l3.86-3.9z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.63-2.82c-1.1.74-2.52 1.18-4.33 1.18-3.03 0-5.62-2.7-6.56-5.71l-3.86 3C3.37 20.25 7.35 23 12 23z" />
              </svg>
            </span>
            <span>{isGoogleLoading ? 'Verifying with Google...' : 'Continue with Google'}</span>
          </button>

          <div className="signup-divide">
            <span>──────── OR ────────</span>
          </div>

          {error && <div className="signup-error-banner">{error}</div>}

          <form onSubmit={handleSignupSubmit} className="signup-form-body">
            <div className="signup-row-two">
              <label className="signup-field-group">
                <span>Full Name</span>
                <div className="field-with-icon">
                  <User size={16} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Full Name"
                  />
                </div>
              </label>

              <label className="signup-field-group">
                <span>Username</span>
                <div className="field-with-icon">
                  {username ? (
                    <UserAvatar username={username} size="sm" />
                  ) : (
                    <User size={16} />
                  )}
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Username"
                  />
                </div>
              </label>
            </div>

            <label className="signup-field-group">
              <span>Email Address</span>
              <div className="field-with-icon">
                <Mail size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Email Address"
                />
              </div>
              {!emailValid && email.length > 0 && <p className="field-hint invalid">Enter a valid email address.</p>}
            </label>

            <label className="signup-field-group">
              <span>Phone Number</span>
              <div className="field-with-icon">
                <Phone size={16} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, ''));
                    if (error) setError('');
                  }}
                  placeholder="Phone Number"
                />
              </div>
            </label>

            <label className="signup-field-group">
              <span>Password</span>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Password"
              />
            </label>

            <label className="signup-field-group">
              <span>Confirm Password</span>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Confirm Password"
              />
              {confirmPassword.length > 0 && !passwordsMatch && <p className="field-hint invalid">Passwords do not match.</p>}
            </label>


            <label className="terms-row">
              <div className={`custom-checkbox ${agreeTerms ? 'checked' : ''}`}>
                {agreeTerms && <Check size={12} />}
              </div>
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              <span>
                I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.
              </span>
            </label>

            <button type="submit" className="ios-primary-btn signup-submit-btn" disabled={isLoading || !isFormValid}>
              {isLoading ? <span className="ios-spinner" /> : <>Create Account <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="signup-page-footer">
            <span>Already have an account?</span>
            <button type="button" className="signup-signin-link" onClick={onBackToLogin}>
              Sign In
            </button>
          </div>
        </section>
      </div>
  );
};

export default SignupPage;
