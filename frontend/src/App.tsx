import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './themeContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import AuthLayout from './components/auth/AuthLayout';
import MobileAppFrame from './components/MobileAppFrame/MobileAppFrame';
import { AUTH_CHANGED_EVENT, isLoggedIn, restoreRealtimeAuthOnBoot } from './api';
import { prefetchAppShell } from './lib/prefetchApp';
import './App.css';

/** Routes a tapped push notification (see lib/pushNotifications.ts). */
const PushNavigationBridge: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const route = (e as CustomEvent<string>).detail;
      if (route) navigate(route);
    };
    window.addEventListener('simsor-push-navigate', onNavigate);
    return () => window.removeEventListener('simsor-push-navigate', onNavigate);
  }, [navigate]);
  return null;
};

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => isLoggedIn());

  useEffect(() => {
    restoreRealtimeAuthOnBoot();
    prefetchAppShell();
  }, []);

  useEffect(() => {
    const sync = () => setIsAuthenticated(isLoggedIn());
    window.addEventListener('storage', sync);
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener('simsor-auth-expired', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener('simsor-auth-expired', sync);
    };
  }, []);

  return (
    <ThemeProvider>
      <MobileAppFrame>
        <Toaster 
          position="bottom-center" 
          toastOptions={{
            style: {
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              fontFamily: 'var(--font-family)',
              fontSize: '14px',
              boxShadow: 'var(--shadow-md)',
            }
          }} 
        />
        <BrowserRouter>
          <PushNavigationBridge />
          <Routes>
            <Route 
              path="/login" 
              element={
                isAuthenticated ? (
                  <Navigate to="/" replace />
                ) : (
                  <AuthLayout />
                )
              } 
            />
            <Route 
              path="/signup" 
              element={
                isAuthenticated ? (
                  <Navigate to="/" replace />
                ) : (
                  <AuthLayout />
                )
              } 
            />
            <Route 
              path="/*" 
              element={
                isAuthenticated ? (
                  <Layout />
                ) : (
                  <Navigate to="/login" replace />
                )
              } 
            />
          </Routes>
        </BrowserRouter>
      </MobileAppFrame>
    </ThemeProvider>
  );
};

export default App;
