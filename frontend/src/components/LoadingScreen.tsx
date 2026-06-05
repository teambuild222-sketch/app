import React from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="loading-screen">
      <div className="loading-container">
        <div className="loading-logo-wrapper">
          <img src="/logo.png" alt="ZENEX Logo" className="loading-logo" />
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
          </div>
        </div>
        <p className="loading-text">{message}</p>
        <div className="loading-dots">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
