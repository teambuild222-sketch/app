import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initMobileApp, isNativeMobileApp } from './mobile/initMobileApp';
import './index.css';

initMobileApp();

if (!isNativeMobileApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
