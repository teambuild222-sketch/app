import React from 'react';
import './LoginPage.css'; // sharing social button styles

interface SocialLoginButtonsProps {
  onSelect: (provider: string) => void;
}

export const SocialLoginButtons: React.FC<SocialLoginButtonsProps> = ({ onSelect }) => {
  return (
    <div className="ios-social-list">
      {/* Apple */}
      <button 
        type="button" 
        className="ios-social-btn apple-btn" 
        onClick={() => onSelect('apple')}
      >
        <svg className="ios-social-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.68-1.12 1.82-.98 2.92.1.08.2.08.3.08.88 0 1.94-.56 2.51-1.39" />
        </svg>
        <span>Continue with Apple</span>
      </button>

      {/* Google */}
      <button 
        type="button" 
        className="ios-social-btn google-btn" 
        onClick={() => onSelect('google')}
      >
        <svg className="ios-social-icon" viewBox="0 0 24 24" width="18" height="18">
          <path
            fill="#EA4335"
            d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.47 14.98 1 12 1 7.35 1 3.37 3.75 1.58 7.75l3.86 3C6.38 7.74 8.97 5.04 12 5.04z"
          />
          <path
            fill="#4285F4"
            d="M23.45 12.3c0-.82-.07-1.6-.2-2.3H12v4.38h6.42c-.28 1.44-1.1 2.66-2.33 3.48l3.63 2.82c2.13-1.96 3.35-4.85 3.35-8.38z"
          />
          <path
            fill="#FBBC05"
            d="M5.44 14.75c-.24-.72-.38-1.5-.38-2.3s.14-1.58.38-2.3L1.58 7.15C.57 9.17 0 11.48 0 13.9s.57 4.73 1.58 6.75l3.86-3.9z"
          />
          <path
            fill="#34A853"
            d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.63-2.82c-1.1.74-2.52 1.18-4.33 1.18-3.03 0-5.62-2.7-6.56-5.71l-3.86 3C3.37 20.25 7.35 23 12 23z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

    </div>
  );
};

export default SocialLoginButtons;
