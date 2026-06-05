import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './themeContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import AuthLayout from './components/auth/AuthLayout';
import './App.css';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('zenex-auth');
  });

  // Track localStorage changes to sync auth state across tabs and triggers
  useEffect(() => {
    const handleStorageChange = () => {
      setIsAuthenticated(!!localStorage.getItem('zenex-auth'));
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Sync active local checks in the same window (e.g. logout action)
    const interval = setInterval(handleStorageChange, 300);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
};

export default App;
