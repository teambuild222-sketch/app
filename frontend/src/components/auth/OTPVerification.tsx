import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import './OTPVerification.css';

interface OTPVerificationProps {
  phoneNumber: string;
  onVerifySuccess: () => void;
  onBack: () => void;
}

export const OTPVerification: React.FC<OTPVerificationProps> = ({
  phoneNumber,
  onVerifySuccess,
  onBack,
}) => {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [countdown, setCountdown] = useState(59);
  
  const inputRefs = useRef<HTMLInputElement[]>([]);

  // Focus the first input box on load
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // Countdown timer logic
  useEffect(() => {
    if (countdown === 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleChange = (value: string, index: number) => {
    // Only allow single digit numbers
    const cleanValue = value.replace(/\D/g, '');
    if (!cleanValue) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      return;
    }

    const digit = cleanValue[cleanValue.length - 1]; // take last character if typed multiple
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    // Auto-advance to next input
    if (index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0 && inputRefs.current[index - 1]) {
        // Move back to previous input and clear it
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1].focus();
      } else if (otp[index]) {
        // Clear current input
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      if (pastedData[i]) {
        newOtp[i] = pastedData[i];
      }
    }
    setOtp(newOtp);
    setError('');

    // Focus last filled digit or final input
    const focusIndex = Math.min(pastedData.length, 5);
    if (inputRefs.current[focusIndex]) {
      inputRefs.current[focusIndex].focus();
    }
  };

  const handleResend = () => {
    if (countdown > 0) return;
    
    // Reset OTP and timer
    setOtp(Array(6).fill(''));
    setError('');
    setCountdown(59);
    
    // Simulate OTP resend
    console.log('OTP resent successfully to', phoneNumber);
    
    // Refocus first input
    setTimeout(() => {
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    }, 50);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredOtp = otp.join('');

    if (enteredOtp.length < 6) {
      setError('Please enter all 6 digits of the code');
      return;
    }

    setIsLoading(true);
    setError('');

    setTimeout(() => {
      // Mock validation: Correct OTP is "123456"
      if (enteredOtp === '123456') {
        setIsLoading(false);
        setIsSuccess(true);
        // Delay success callback for visual feedback
        setTimeout(() => {
          onVerifySuccess();
        }, 800);
      } else {
        setIsLoading(false);
        setError('Incorrect verification code. Try "123456" for testing.');
        // Highlight incorrect code
        if (inputRefs.current[5]) {
          inputRefs.current[5].select();
        }
      }
    }, 1200);
  };

  const isOtpComplete = otp.every((val) => val !== '');

  return (
    <div className="otp-card-wrapper">
      <div className="glass-card otp-card">
        {/* Back navigation */}
        <button className="otp-back-btn" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={18} />
          <span>Change Number</span>
        </button>

        {/* Header */}
        <div className="otp-header-section">
          <h2 className="otp-title">Enter Verification Code</h2>
          <p className="otp-subtitle">
            We sent a 6-digit code to <span className="highlight-phone">{phoneNumber}</span>
          </p>
        </div>

        {/* Verification Form */}
        <form onSubmit={handleVerify} className="otp-form">
          <div className="otp-inputs-grid">
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  if (el) inputRefs.current[idx] = el;
                }}
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(e.target.value, idx)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                onPaste={idx === 0 ? handlePaste : undefined}
                className={`otp-input-field ${error ? 'otp-input-error' : ''} ${digit ? 'filled' : ''}`}
                disabled={isLoading || isSuccess}
                aria-label={`Digit ${idx + 1}`}
              />
            ))}
          </div>

          {error && <div className="otp-error-message">{error}</div>}

          {/* Countdown & Resend Option */}
          <div className="otp-timer-section">
            {countdown > 0 ? (
              <span className="otp-countdown">
                Resend code in <strong className="timer-count">0:{countdown < 10 ? `0${countdown}` : countdown}</strong>
              </span>
            ) : (
              <button 
                type="button" 
                className="otp-resend-btn" 
                onClick={handleResend}
              >
                Resend OTP
              </button>
            )}
          </div>

          {/* Submit Verification Button */}
          <button
            type="submit"
            className={`btn-verify-otp ${isSuccess ? 'success' : ''} ${isLoading ? 'loading' : ''}`}
            disabled={isLoading || isSuccess || !isOtpComplete}
          >
            {isSuccess ? (
              <span className="success-wrapper animate-bounceIn">
                <CheckCircle size={18} />
                Verified Successfully!
              </span>
            ) : isLoading ? (
              <span className="spinner-wrapper">
                <span className="spinner" />
                Verifying...
              </span>
            ) : (
              'Verify & Continue'
            )}
          </button>
        </form>

        {/* Quick hint for testing */}
        <div className="test-hint-badge">
          💡 Test Hint: Use code <strong>123456</strong> to verify
        </div>
      </div>
    </div>
  );
};

export default OTPVerification;
