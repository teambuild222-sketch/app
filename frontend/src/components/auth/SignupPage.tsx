import React, { useState } from 'react';
import { User, Mail, Phone, Lock, Check, ArrowLeft } from 'lucide-react';
import PasswordInput from './PasswordInput';
import SocialLoginButtons from './SocialLoginButtons';
import './SignupPage.css';

interface SignupPageProps {
  onBackToLogin: () => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onBackToLogin }) => {
  // Signup forms state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true); // default true for convenience
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Interest selection lists
  const [selectedSports, setSelectedSports] = useState<string[]>(['Cricket', 'Football']);
  const [selectedEnt, setSelectedEnt] = useState<string[]>(['Music', 'Food Events']);

  const sportsList = [
    { name: 'Cricket', emoji: '🏏' },
    { name: 'Football', emoji: '⚽' },
    { name: 'Badminton', emoji: '🏸' },
    { name: 'Running', emoji: '🏃' },
    { name: 'Pickleball', emoji: '🏓' },
  ];

  const entList = [
    { name: 'Music', emoji: '🎵' },
    { name: 'Open Mic', emoji: '🎤' },
    { name: 'Food Events', emoji: '🍔' },
    { name: 'Theatre', emoji: '🎭' },
    { name: 'Movies', emoji: '🎬' },
  ];

  const toggleSport = (sportName: string) => {
    setSelectedSports((prev) =>
      prev.includes(sportName)
        ? prev.filter((s) => s !== sportName)
        : [...prev, sportName]
    );
  };

  const toggleEnt = (entName: string) => {
    setSelectedEnt((prev) =>
      prev.includes(entName)
        ? prev.filter((e) => e !== entName)
        : [...prev, entName]
    );
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !username || !email || !phone || !password || !confirmPassword) {
      setError('Please fill in all registration fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!agreeTerms) {
      setError('You must agree to the Terms of Service & Privacy Policy');
      return;
    }

    setIsLoading(true);
    setError('');

    // Simulate signup completion
    setTimeout(() => {
      localStorage.setItem('zenex-auth', 'true');
      localStorage.setItem('zenex-username', username.trim());
      localStorage.setItem('zenex-fullname', fullName.trim());
      window.location.href = '/';
    }, 1500);
  };

  const isFormValid = fullName && username && email && phone && password && confirmPassword && (password === confirmPassword) && agreeTerms;

  return (
    <div className="ios-auth-card-body signup-body">
      <div className="signup-header-actions">
        <button type="button" className="signup-back-btn" onClick={onBackToLogin} aria-label="Back to Login">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        {/* Placeholder to balance flex layout */}
        <div style={{ width: 60 }}></div>
      </div>

      {/* Logo Section */}
      <div className="auth-logo-container">
        <img src="/logo.png" alt="ZENEX Logo" className="auth-logo" />
        <h1 className="auth-app-name">ZENEX</h1>
      </div>

      <div className="ios-welcome-header">
        <h2 className="ios-welcome-title">Create Your Account 🎉</h2>
        <p className="ios-welcome-subtitle">
          Join Zenex and discover sports and entertainment communities
        </p>
      </div>

      {error && (
        <div className="ios-error-banner animate-bounceIn">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSignupSubmit} className="ios-auth-form signup-form">
        {/* Name / Username Row (2 column) */}
        <div className="ios-row-2col">
          <div className="ios-form-group">
            <label className="ios-input-label" htmlFor="fullName">Full Name</label>
            <div className="ios-input-wrapper">
              <div className="ios-input-icon-left">
                <User size={16} />
              </div>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Full Name"
                className="ios-input-field padding-col"
              />
            </div>
          </div>

          <div className="ios-form-group">
            <label className="ios-input-label" htmlFor="reg-username">Username</label>
            <div className="ios-input-wrapper">
              <div className="ios-input-icon-left">
                <User size={16} />
              </div>
              <input
                type="text"
                id="reg-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Username"
                className="ios-input-field padding-col"
              />
            </div>
          </div>
        </div>

        {/* Email Address */}
        <div className="ios-form-group">
          <label className="ios-input-label" htmlFor="email">Email Address</label>
          <div className="ios-input-wrapper">
            <div className="ios-input-icon-left">
              <Mail size={16} />
            </div>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="Email Address"
              className="ios-input-field"
            />
          </div>
        </div>

        {/* Phone Input with Country Code Selector */}
        <div className="ios-form-group">
          <label className="ios-input-label" htmlFor="phone">Phone Number</label>
          <div className="ios-phone-input-container">
            <div className="ios-country-selector">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country Code"
              >
                <option value="+91">+91 🇮🇳</option>
                <option value="+1">+1 🇺🇸</option>
                <option value="+44">+44 🇬🇧</option>
                <option value="+971">+971 🇦🇪</option>
                <option value="+61">+61 🇦🇺</option>
              </select>
              <span className="ios-selector-arrow">▼</span>
            </div>
            <div className="ios-phone-input-wrapper">
              <div className="ios-input-icon-left">
                <Phone size={16} />
              </div>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ''));
                  if (error) setError('');
                }}
                placeholder="Phone Number"
                className="ios-input-field"
              />
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="ios-form-group">
          <label className="ios-input-label" htmlFor="reg-password">Password</label>
          <PasswordInput
            id="reg-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="Password"
          />
        </div>

        {/* Confirm Password */}
        <div className="ios-form-group">
          <label className="ios-input-label" htmlFor="confirmPassword">Confirm Password</label>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="Confirm Password"
          />
        </div>

        {/* Interest Selection Section */}
        <div className="ios-interests-section">
          <div className="ios-interests-header-row">
            <span className="ios-interests-section-title">Select Your Interests</span>
            <span className="ios-interests-section-subtitle">(Select all that apply)</span>
          </div>

          {/* Sports */}
          <div className="ios-interest-category">
            <span className="ios-category-label">Sports</span>
            <div className="ios-chips-grid">
              {sportsList.map((item) => {
                const isSelected = selectedSports.includes(item.name);
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`ios-capsule-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSport(item.name)}
                  >
                    <span>{item.emoji} {item.name}</span>
                    {isSelected && (
                      <span className="ios-chip-checkmark">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entertainment */}
          <div className="ios-interest-category">
            <span className="ios-category-label">Entertainment</span>
            <div className="ios-chips-grid">
              {entList.map((item) => {
                const isSelected = selectedEnt.includes(item.name);
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`ios-capsule-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleEnt(item.name)}
                  >
                    <span>{item.emoji} {item.name}</span>
                    {isSelected && (
                      <span className="ios-chip-checkmark">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Terms Checkbox */}
        <label className="ios-checkbox-label">
          <div className="ios-checkbox-wrapper">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="ios-checkbox-hidden"
            />
            <div className={`ios-checkbox-custom ${agreeTerms ? 'checked' : ''}`}>
              {agreeTerms && <Check size={12} strokeWidth={3} />}
            </div>
          </div>
          <span className="ios-checkbox-text">
            I agree to the <a href="#terms" className="ios-inline-link" onClick={(e) => {e.preventDefault(); alert('Terms of Service dialog placeholder.');}}>Terms of Service</a> and <a href="#privacy" className="ios-inline-link" onClick={(e) => {e.preventDefault(); alert('Privacy Policy dialog placeholder.');}}>Privacy Policy</a>
          </span>
        </label>

        {/* Large Blue Apple-style Create Account Button */}
        <button
          type="submit"
          className={`ios-primary-btn signup-btn ${isLoading ? 'loading' : ''}`}
          disabled={isLoading || !isFormValid}
        >
          {isLoading ? (
            <span className="ios-spinner" />
          ) : (
            <>
              <span>Create Account</span>
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
        <span>──────── OR ────────</span>
      </div>

      {/* Social Options */}
      <SocialLoginButtons onSelect={(provider) => alert(`Connecting with ${provider}...`)} />

      {/* Footer link to go back to Login */}
      <div className="signup-footer">
        <span>Already have an account?</span>
        <button type="button" className="signup-signin-link" onClick={onBackToLogin}>
          Sign In
        </button>
      </div>
    </div>
  );
};

export default SignupPage;
