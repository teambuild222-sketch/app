import React from 'react';

interface UserAvatarProps {
  username: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const generateAvatarColor = (username: string): string => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A29BFE',
    '#74B9FF', '#A29BFE', '#6C5CE7', '#00B894', '#FDCB6E'
  ];
  
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (username: string): string => {
  return username
    .split(/[._-]/)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
};

const sizeMap = {
  sm: { width: '24px', height: '24px', fontSize: '10px' },
  md: { width: '40px', height: '40px', fontSize: '14px' },
  lg: { width: '60px', height: '60px', fontSize: '20px' }
};

export const UserAvatar: React.FC<UserAvatarProps> = ({ 
  username, 
  size = 'md',
  className = ''
}) => {
  const bgColor = generateAvatarColor(username);
  const initials = getInitials(username);
  const dimensions = sizeMap[size];

  return (
    <div
      className={`user-avatar ${className}`}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: bgColor,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: dimensions.fontSize,
        fontWeight: 600,
        color: 'white',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        userSelect: 'none'
      }}
      title={username}
    >
      {initials}
    </div>
  );
};

export default UserAvatar;
