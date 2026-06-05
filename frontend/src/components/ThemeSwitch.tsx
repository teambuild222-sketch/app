import React from 'react';
import { useTheme } from '../themeContext';
import { Sun, Moon } from 'lucide-react';
import './ThemeSwitch.css';

export const ThemeSwitch: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`ios-theme-switch ${isDark ? 'active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleTheme();
      }}
      aria-label="Toggle theme mode"
      aria-checked={isDark}
      role="switch"
    >
      <div className="ios-switch-thumb">
        {isDark ? (
          <Moon size={12} className="ios-switch-icon moon" />
        ) : (
          <Sun size={12} className="ios-switch-icon sun" />
        )}
      </div>
    </button>
  );
};

export default ThemeSwitch;
