import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import './LoginPage.css'; // sharing input styles

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  id?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = 'Enter password',
  id = 'password',
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const toggleShowPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="ios-input-wrapper">
      <div className="ios-input-icon-left">
        <Lock size={18} />
      </div>
      <input
        type={showPassword ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="ios-input-field password-field"
      />
      <button
        type="button"
        onClick={toggleShowPassword}
        className="ios-input-icon-right"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

export default PasswordInput;
