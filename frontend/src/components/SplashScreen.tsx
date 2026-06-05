import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  duration?: number;
  onComplete?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ duration = 3000, onComplete }) => {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsClosing(true);
      if (onComplete) {
        setTimeout(onComplete, 600);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <div className={`splash-screen ${isClosing ? 'closing' : ''}`}>
      <div className="splash-container">
        <div className="splash-content">
          <div className="splash-logo-wrapper">
            <img src="/logo.png" alt="ZENEX" className="splash-logo" />
            <div className="splash-glow"></div>
          </div>
          <h1 className="splash-title">ZENEX</h1>
          <p className="splash-tagline">Zenith of Nexus</p>
          <p className="splash-description">Your premium sports and entertainment social platform</p>
        </div>
        
        <div className="splash-bottom">
          <div className="splash-dot splash-dot-1"></div>
          <div className="splash-dot splash-dot-2"></div>
          <div className="splash-dot splash-dot-3"></div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
