import React, { useState, useRef, useEffect } from 'react';
import { 
  Trophy, 
  Target, 
  Calendar, 
  Users, 
  ChevronRight, 
  X, 
  Award, 
  Grid, 
  Bookmark, 
  Bell, 
  Settings, 
  Share2, 
  MoreHorizontal, 
  MapPin, 
  Check, 
  User as UserIcon, 
  HelpCircle, 
  Shield, 
  Palette, 
  Gift, 
  Camera, 
  LogOut,
  MessageCircle,
  Mail,
  CheckCircle2,
  Trash2,
  Copy,
  Link as LinkIcon,
  Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ThemeSwitch } from '../ThemeSwitch';
import { useTheme } from '../../themeContext';
import { MembershipModal, getSavedPlan, PLAN_CHANGE_EVENT, PlanType } from '../Membership/Membership';
import './ProfileView.css';

type TabType = 'posts' | 'events' | 'badges' | 'saved';

// Taken usernames list for real-time validation mockup
const TAKEN_USERNAMES = ['admin', 'neha', 'rahul', 'aisha', 'root', 'auth', 'sports', 'zenex', 'cricket', 'manager', 'football'];

export const ProfileView: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  // Membership states
  const [membershipPlan, setMembershipPlan] = useState<PlanType>(getSavedPlan);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);

  useEffect(() => {
    const handlePlanChange = () => {
      setMembershipPlan(getSavedPlan());
    };
    window.addEventListener(PLAN_CHANGE_EVENT, handlePlanChange);
    return () => {
      window.removeEventListener(PLAN_CHANGE_EVENT, handlePlanChange);
    };
  }, []);
  
  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Dynamic Profile states synchronized with localStorage
  const [fullName, setFullName] = useState(() => localStorage.getItem('zenex-fullname') || 'Admin User');
  const [username, setUsername] = useState(() => localStorage.getItem('zenex-username') || 'admin');
  const [bio, setBio] = useState(() => localStorage.getItem('zenex-bio') || 'Sports Enthusiast • Event Explorer');
  const [location, setLocation] = useState(() => localStorage.getItem('zenex-location') || 'Hyderabad, India');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('zenex-avatar') || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');
  
  const [sports, setSports] = useState<string[]>(() => {
    const saved = localStorage.getItem('zenex-sports');
    return saved ? JSON.parse(saved) : ['Cricket', 'Football'];
  });
  const [entertainment, setEntertainment] = useState<string[]>(() => {
    const saved = localStorage.getItem('zenex-ent');
    return saved ? JSON.parse(saved) : ['Music', 'Food Events'];
  });

  // Stats
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [badgesCount, setBadgesCount] = useState<number>(0);

  // --------------------------------------------------
  // EDIT PROFILE TEMPORARY STATES
  // --------------------------------------------------
  const [tempFullName, setTempFullName] = useState(fullName);
  const [tempUsername, setTempUsername] = useState(username);
  const [tempBio, setTempBio] = useState(bio);
  const [tempLocation, setTempLocation] = useState(location);
  const [tempAvatar, setTempAvatar] = useState(avatar);
  const [tempSports, setTempSports] = useState<string[]>(sports);
  const [tempEnt, setTempEnt] = useState<string[]>(entertainment);

  // Crop & Image upload states
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<{
    status: 'checking' | 'available' | 'taken' | 'invalid' | 'idle';
    message: string;
  }>({ status: 'idle', message: '' });

  // Sync temporary states when opening Edit Modal
  const handleOpenEdit = () => {
    setTempFullName(fullName);
    setTempUsername(username);
    setTempBio(bio);
    setTempLocation(location);
    setTempAvatar(avatar);
    setTempSports(sports);
    setTempEnt(entertainment);
    setUploadedImage(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setUsernameStatus({ status: 'idle', message: '' });
    setIsEditModalOpen(true);
  };

  // Real-time username check
  useEffect(() => {
    if (!isEditModalOpen) return;
    if (tempUsername.trim().toLowerCase() === username.toLowerCase()) {
      setUsernameStatus({ status: 'idle', message: '' });
      return;
    }

    const cleanUsername = tempUsername.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setUsernameStatus({ status: 'invalid', message: 'Must be at least 3 characters' });
      return;
    }

    setUsernameStatus({ status: 'checking', message: 'Checking availability...' });
    const timer = setTimeout(() => {
      if (TAKEN_USERNAMES.includes(cleanUsername)) {
        setUsernameStatus({ status: 'taken', message: `Username @${cleanUsername} is already taken ❌` });
      } else {
        setUsernameStatus({ status: 'available', message: `Username @${cleanUsername} is available! ✔️` });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [tempUsername, isEditModalOpen, username]);

  // Image Upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Image Drag crop handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!uploadedImage) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !uploadedImage) return;
    setCropOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Canvas Crop & Save locally
  const performCrop = (): string | null => {
    if (!uploadedImage || !cropCanvasRef.current) return null;
    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const img = new Image();
    img.src = uploadedImage;

    // Use synchronous draw logic after loading image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw cropped region on 300x300 canvas
    const size = 300;
    canvas.width = size;
    canvas.height = size;

    // Draw centering image, taking zoom and offset into account
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Map offset to canvas scale
    const drawSize = size * cropZoom;
    const dx = (size - drawSize) / 2 + cropOffset.x;
    const dy = (size - drawSize) / 2 + cropOffset.y;

    ctx.drawImage(img, dx, dy, drawSize, drawSize);
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handleRemovePhoto = () => {
    setTempAvatar('https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');
    setUploadedImage(null);
    toast.success('Profile photo removed');
  };

  // Save changes callback
  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();

    if (!tempFullName.trim()) {
      toast.error('Full Name cannot be empty');
      return;
    }

    if (usernameStatus.status === 'taken' || usernameStatus.status === 'invalid') {
      toast.error('Please fix the username errors before saving');
      return;
    }

    let finalAvatar = tempAvatar;
    if (uploadedImage) {
      const cropped = performCrop();
      if (cropped) finalAvatar = cropped;
    }

    // Persist profile
    setFullName(tempFullName.trim());
    setUsername(tempUsername.trim().toLowerCase());
    setBio(tempBio);
    setLocation(tempLocation.trim());
    setAvatar(finalAvatar);
    setSports(tempSports);
    setEntertainment(tempEnt);

    localStorage.setItem('zenex-fullname', tempFullName.trim());
    localStorage.setItem('zenex-username', tempUsername.trim().toLowerCase());
    localStorage.setItem('zenex-bio', tempBio);
    localStorage.setItem('zenex-location', tempLocation.trim());
    localStorage.setItem('zenex-avatar', finalAvatar);
    localStorage.setItem('zenex-sports', JSON.stringify(tempSports));
    localStorage.setItem('zenex-ent', JSON.stringify(tempEnt));

    setIsEditModalOpen(false);
    toast.success('Profile updated successfully', {
      style: {
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        fontFamily: 'var(--font-family)',
      }
    });
  };

  // --------------------------------------------------
  // SHARE PROFILE ACTIONS
  // --------------------------------------------------
  const profileUrl = `https://zenex.app/u/${username}`;

  const copyProfileLink = () => {
    navigator.clipboard.writeText(profileUrl)
      .then(() => {
        toast.success('Profile link copied');
      })
      .catch(() => {
        toast.error('Failed to copy link');
      });
  };

  const copyUsernameOnly = () => {
    navigator.clipboard.writeText(`@${username}`)
      .then(() => {
        toast.success('Username copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy username');
      });
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Check out my Zenex profile: ${profileUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`, '_blank');
  };

  const shareX = () => {
    const text = encodeURIComponent(`Check out my premium Zenex sports and entertainment profile!`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(profileUrl)}`, '_blank');
  };

  const shareEmail = () => {
    window.location.href = `mailto:?subject=Check%20out%20my%20Zenex%20profile&body=Here%20is%20my%20Zenex%20profile%20link%3A%20${encodeURIComponent(profileUrl)}`;
  };

  // Draw and Download Instagram Share Card using Canvas
  const exportInstagramCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 540;
    canvas.height = 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // 1. Draw Background
    if (isDarkMode) {
      // Dark luxurious theme background
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, 540, 960);
      
      // Card Container
      ctx.fillStyle = '#343434';
      ctx.strokeStyle = 'rgba(233, 220, 190, 0.15)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, 35, 100, 470, 760, 24);
      ctx.fill();
      ctx.stroke();
    } else {
      // Light luxurious background
      ctx.fillStyle = '#F3F3F3';
      ctx.fillRect(0, 0, 540, 960);
      
      // Card Container
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = 'rgba(52, 52, 52, 0.08)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, 35, 100, 470, 760, 24);
      ctx.fill();
      ctx.stroke();
    }

    // 2. Draw Logo / Header
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = isDarkMode ? '#E9DCBE' : '#343434';
    ctx.fillText('ZENEX', 270, 160);

    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = isDarkMode ? '#8E8B82' : '#8E8B82';
    ctx.fillText('SPORTS & ENTERTAINMENT', 270, 185);

    // 3. Draw Profile Picture Circle
    const avatarImg = new Image();
    avatarImg.crossOrigin = 'anonymous';
    avatarImg.src = avatar;

    avatarImg.onload = () => {
      drawAvatarAndText();
    };

    avatarImg.onerror = () => {
      // Fallback if image CORS fails to load
      drawAvatarAndText(true);
    };

    function drawAvatarAndText(useFallback = false) {
      // Circle Center
      const cx = 270;
      const cy = 290;
      const r = 60;

      // Outer golden/cream ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#E9DCBE';
      ctx.lineWidth = 3;
      ctx.stroke();

      if (useFallback || !avatarImg.complete) {
        // Draw elegant circular initials monogram
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#343434';
        ctx.fill();
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = '#E9DCBE';
        ctx.fillText(fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2), cx, cy + 12);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      }

      // 4. Full Name & Username
      ctx.fillStyle = isDarkMode ? '#F3F3F3' : '#343434';
      ctx.font = 'bold 24px sans-serif';
      const nameY = 390;
      ctx.fillText(fullName, cx, nameY);

      // Verified Badge icon next to name
      const nameWidth = ctx.measureText(fullName).width;
      ctx.fillStyle = '#007AFF';
      ctx.beginPath();
      ctx.arc(cx + (nameWidth / 2) + 16, nameY - 8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('✓', cx + (nameWidth / 2) + 16, nameY - 4);

      // Username text
      ctx.fillStyle = '#8E8B82';
      ctx.font = '500 15px sans-serif';
      ctx.fillText(`@${username}`, cx, 420);

      // 5. Statistics Rows
      const statsY = 490;
      const statsWidth = 380;
      const statX1 = cx - 110;
      const statX2 = cx;
      const statX3 = cx + 110;

      // Stats Divider line
      ctx.beginPath();
      ctx.moveTo(cx - 180, statsY - 45);
      ctx.lineTo(cx + 180, statsY - 45);
      ctx.strokeStyle = isDarkMode ? 'rgba(233, 220, 190, 0.1)' : 'rgba(52, 52, 52, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stats columns
      drawStatCol(statX1, followersCount.toString(), 'Followers');
      drawStatCol(statX2, eventsCount.toString(), 'Events');
      drawStatCol(statX3, badgesCount.toString(), 'Badges');

      // Helper function to draw single stat column
      function drawStatCol(x: number, val: string, label: string) {
        ctx.textAlign = 'center';
        ctx.fillStyle = isDarkMode ? '#F3F3F3' : '#343434';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(val.toString(), x, statsY - 10);
        ctx.fillStyle = '#8E8B82';
        ctx.font = '600 11px sans-serif';
        ctx.fillText(label.toUpperCase(), x, statsY + 12);
      }

      ctx.beginPath();
      ctx.moveTo(cx - 180, statsY + 35);
      ctx.lineTo(cx + 180, statsY + 35);
      ctx.stroke();

      // 6. Draw Mock Vector QR Code
      const qrSize = 140;
      const qrX = cx - qrSize / 2;
      const qrY = 580;

      // Draw white background wrapper
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12);
      ctx.fill();

      // Draw corner squares (finders patterns)
      ctx.fillStyle = '#343434';
      ctx.fillRect(qrX, qrY, 40, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX + 8, qrY + 8, 24, 24);
      ctx.fillStyle = '#343434';
      ctx.fillRect(qrX + 12, qrY + 12, 16, 16);

      ctx.fillRect(qrX + qrSize - 40, qrY, 40, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX + qrSize - 32, qrY + 8, 24, 24);
      ctx.fillStyle = '#343434';
      ctx.fillRect(qrX + qrSize - 28, qrY + 12, 16, 16);

      ctx.fillRect(qrX, qrY + qrSize - 40, 40, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX + 8, qrY + qrSize - 32, 24, 24);
      ctx.fillStyle = '#343434';
      ctx.fillRect(qrX + 12, qrY + qrSize - 28, 16, 16);

      // Draw random elegant pattern blocks
      ctx.fillStyle = '#343434';
      // Columns
      ctx.fillRect(qrX + 50, qrY + 5, 12, 12);
      ctx.fillRect(qrX + 75, qrY, 15, 15);
      ctx.fillRect(qrX + 50, qrY + 30, 25, 12);
      ctx.fillRect(qrX + 5, qrY + 50, 12, 25);
      ctx.fillRect(qrX + 30, qrY + 50, 15, 15);
      ctx.fillRect(qrX + 60, qrY + 55, 30, 10);
      ctx.fillRect(qrX + 105, qrY + 50, 12, 35);
      ctx.fillRect(qrX + 90, qrY + 25, 20, 12);
      ctx.fillRect(qrX + 120, qrY + 90, 15, 30);
      ctx.fillRect(qrX + 50, qrY + 90, 30, 12);
      ctx.fillRect(qrX + 10, qrY + 90, 25, 15);
      ctx.fillRect(qrX + 60, qrY + 115, 15, 15);
      ctx.fillRect(qrX + 90, qrY + 110, 25, 12);

      // Draw Center Gold Zenex Star (Mock Branding)
      ctx.fillStyle = '#E9DCBE';
      ctx.fillRect(qrX + qrSize / 2 - 15, qrY + qrSize / 2 - 15, 30, 30);
      ctx.fillStyle = '#343434';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Z', qrX + qrSize / 2, qrY + qrSize / 2 + 8);

      // Footer
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = '#8E8B82';
      ctx.fillText('SCAN QR CODE TO VIEW PROFILE', cx, 770);
      ctx.fillText('zenex.app/u/' + username, cx, 790);

      // Export/Download trigger
      const link = document.createElement('a');
      link.download = `${username}_zenex_profile.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      toast.success('Stories card downloaded!');
    }
  };

  // Rounded rectangle helper
  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height - radius);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Helper stats click
  const handleStatClick = (statLabel: string) => {
    if (statLabel === 'Followers' && followersCount === 0) {
      toast('No followers yet.');
    } else if (statLabel === 'Following' && followingCount === 0) {
      toast('Not following anyone yet.');
    } else if (statLabel === 'Events' && eventsCount === 0) {
      toast('No events joined yet.');
    } else if (statLabel === 'Badges' && badgesCount === 0) {
      toast('Start participating in events to earn badges.');
    } else {
      toast(`Tapped on ${statLabel} details.`);
    }
  };

  const handleLogout = () => {
    toast.success('Logged out successfully');
  };

  return (
    <div className="ios-profile-shell">
      {/* Hidden canvas for photo cropping */}
      <canvas ref={cropCanvasRef} style={{ display: 'none' }} />

      {/* Settings gear trigger icon on mobile */}
      <button 
        type="button" 
        className="ios-profile-settings-btn"
        onClick={() => setIsSettingsOpen(true)}
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>

      {/* Main Profile Info Header */}
      <div className="ios-profile-info-header">
        <div className="ios-profile-avatar-outer-wrap">
          <div className="ios-profile-avatar-circle" onClick={handleOpenEdit} title="Edit Profile Details">
            <img 
              src={avatar} 
              alt={`${fullName} Profile`} 
              className="ios-profile-img"
            />
            {/* Camera hover overlay */}
            <div className="ios-profile-avatar-overlay">
              <Camera size={18} />
            </div>
            {/* Green Online Indicator */}
            <div className="ios-online-indicator-badge" />
          </div>
        </div>

        <div className="ios-profile-details">
          <div className="ios-profile-name-row">
            <h2 className="ios-profile-fullname">{fullName}</h2>
            {/* Verification Badge */}
            <div className="ios-verify-badge-badge" title="Verified User">
              <svg viewBox="0 0 24 24" className="ios-verify-check" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
          </div>
          <span className="ios-profile-username">@{username}</span>
          <p className="ios-profile-bio">{bio}</p>
          
          <div className="ios-profile-meta-row">
            <div className="ios-profile-meta-item">
              <MapPin size={13} className="ios-meta-icon" />
              <span>{location}</span>
            </div>
            <div className="ios-profile-meta-item">
              <Calendar size={13} className="ios-meta-icon" />
              <span>Joined Feb 2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* Social Stats Pill glass card */}
      <div className="ios-stats-glass-card">
        <button type="button" className="ios-stat-item-btn" onClick={() => handleStatClick('Following')}>
          <Users size={18} className="ios-stat-icon icon-blue" />
          <span className="ios-stat-value">{followingCount}</span>
          <span className="ios-stat-label">Following</span>
        </button>

        <button type="button" className="ios-stat-item-btn" onClick={() => handleStatClick('Followers')}>
          <Users size={18} className="ios-stat-icon icon-pink" />
          <span className="ios-stat-value">{followersCount}</span>
          <span className="ios-stat-label">Followers</span>
        </button>

        <button type="button" className="ios-stat-item-btn" onClick={() => handleStatClick('Events')}>
          <Calendar size={18} className="ios-stat-icon icon-purple" />
          <span className="ios-stat-value">{eventsCount}</span>
          <span className="ios-stat-label">Events</span>
        </button>

        <button type="button" className="ios-stat-item-btn" onClick={() => handleStatClick('Badges')}>
          <Award size={18} className="ios-stat-icon icon-yellow" />
          <span className="ios-stat-value">{badgesCount}</span>
          <span className="ios-stat-label">Badges</span>
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="ios-action-buttons-row">
        <button 
          type="button" 
          className="ios-profile-btn ios-btn-white"
          onClick={handleOpenEdit}
        >
          <UserIcon size={14} />
          <span>Edit Profile</span>
        </button>

        <button 
          type="button" 
          className="ios-profile-btn ios-btn-blue"
          onClick={() => setIsShareModalOpen(true)}
        >
          <Share2 size={14} />
          <span>Share Profile</span>
        </button>
      </div>

      {/* Achievements Horizontal Section */}
      <div className="ios-achievements-scroller-wrap">
        <div className="ios-achievements-scroll-content">
          <div className="ios-badge-card card-yellow">
            <div className="ios-badge-icon-bg">
              <Trophy size={18} />
            </div>
            <span className="ios-badge-name">Event Champion</span>
          </div>

          <div className="ios-badge-card card-green">
            <div className="ios-badge-icon-bg">
              <Target size={18} />
            </div>
            <span className="ios-badge-name">Community Builder</span>
          </div>

          <div className="ios-badge-card card-blue">
            <div className="ios-badge-icon-bg">
              <Users size={18} />
            </div>
            <span className="ios-badge-name">Sports Enthusiast</span>
          </div>

          <div className="ios-badge-card card-purple">
            <div className="ios-badge-icon-bg">
              <Award size={18} />
            </div>
            <span className="ios-badge-name">Entertainment Explorer</span>
          </div>
        </div>
      </div>

      {/* Profile Tab Control */}
      <div className="ios-profile-tab-control">
        <button 
          type="button" 
          className={`ios-profile-tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          <Grid size={16} />
          <span>Posts</span>
        </button>

        <button 
          type="button" 
          className={`ios-profile-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <Calendar size={16} />
          <span>Events</span>
        </button>

        <button 
          type="button" 
          className={`ios-profile-tab-btn ${activeTab === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveTab('badges')}
        >
          <Award size={16} />
          <span>Badges</span>
        </button>

        <button 
          type="button" 
          className={`ios-profile-tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          <Bookmark size={16} />
          <span>Saved</span>
        </button>
      </div>

      {/* Profile Tab Viewport */}
      <div className="ios-profile-tab-viewport">
        {activeTab === 'posts' && (
          <div className="ios-activity-feed-list animate-fadeIn">
            {/* Show custom dynamically updated tags summary if they exist */}
            <div className="ios-badge-card" style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, width: '100%', cursor: 'default' }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5, fontWeight: 700 }}>Custom Selected Tags</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {sports.map(s => (
                  <span key={s} style={{ background: 'var(--bg-badge)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>🏏 {s}</span>
                ))}
                {entertainment.map(e => (
                  <span key={e} style={{ background: 'rgba(233,220,190,0.15)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>🎵 {e}</span>
                ))}
              </div>
            </div>

            {/* List Activities */}
            {[
              {
                id: 1,
                icon: '🏏',
                title: 'Joined Cricket Tournament',
                desc: 'Zenex Premier League 2024',
                time: '2h ago',
                thumbnail: 'https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=150&h=100&q=80',
              },
              {
                id: 2,
                icon: '🎤',
                title: 'Attended Open Mic Night',
                desc: 'The Habitat, Hyderabad',
                time: '1d ago',
                thumbnail: 'https://images.unsplash.com/photo-1516280440614-37939bbacd6a?auto=format&fit=crop&w=150&h=100&q=80',
              },
              {
                id: 3,
                icon: '🤝',
                title: 'Connected with Rahul Sharma',
                desc: 'Now you are connected',
                time: '2d ago',
                thumbnail: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&h=150&q=80',
              },
              {
                id: 4,
                icon: '⚽',
                title: 'Created Football Event',
                desc: 'Sunday Football Match',
                time: '3d ago',
                thumbnail: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=150&h=100&q=80',
              }
            ].map((item) => (
              <div key={item.id} className="ios-activity-item-card">
                <div className="ios-activity-left-side">
                  <div className="ios-activity-emoji-icon">
                    {item.icon}
                  </div>
                  <div className="ios-activity-info">
                    <span className="ios-activity-title">{item.title}</span>
                    <span className="ios-activity-desc">{item.desc}</span>
                    <span className="ios-activity-time">{item.time}</span>
                  </div>
                </div>

                <div className="ios-activity-right-side">
                  <img src={item.thumbnail} alt={item.title} className="ios-activity-thumbnail" />
                  <button type="button" className="ios-activity-options-btn" onClick={() => toast('Options clicked')}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="ios-profile-tab-empty animate-fadeIn">
            <Calendar size={36} className="empty-state-icon" />
            <h3>{eventsCount === 0 ? 'No events joined yet.' : `${eventsCount} Events Joined`}</h3>
            {eventsCount === 0 ? (
              <p>Host or join local cricket or entertainment gatherings to start tracking activities here.</p>
            ) : null}
          </div>
        )}

        {activeTab === 'badges' && (
          <div className="ios-profile-tab-empty animate-fadeIn">
            <Trophy size={36} className="empty-state-icon" />
            <h3>{badgesCount === 0 ? 'No badges earned yet.' : `${badgesCount} Badges Earned`}</h3>
            <p>{badgesCount === 0 ? 'Start participating in events to earn badges.' : 'Explore challenges around Hyderabad to unlock more achievements badges.'}</p>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="ios-profile-tab-empty animate-fadeIn">
            <Bookmark size={36} className="empty-state-icon" />
            <h3>No Saved Items</h3>
            <p>Save events, tournament layouts, or organizers' pages for offline access later.</p>
          </div>
        )}
      </div>

      {/* --------------------------------------------------
          EDIT PROFILE MODAL
          -------------------------------------------------- */}
      {isEditModalOpen && (
        <div className="ios-drawer-overlay edit-profile-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="ios-drawer-sheet edit-profile-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => setIsEditModalOpen(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body scrollable">
              <h3 className="ios-drawer-title">Edit Profile</h3>
              <p className="ios-drawer-subtitle">Keep your sporting bio updated</p>

              <form onSubmit={handleSaveChanges} className="edit-profile-form">
                
                {/* Photo Upload / Remove Section */}
                <div className="edit-photo-section">
                  <div className="crop-frame-wrapper">
                    {uploadedImage ? (
                      <div 
                        className="crop-drag-area"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                      >
                        <img 
                          src={uploadedImage} 
                          alt="To Crop" 
                          className="crop-source-image"
                          style={{
                            transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                            cursor: isDragging ? 'grabbing' : 'grab'
                          }}
                          draggable={false}
                        />
                        <div className="crop-lens-overlay" />
                      </div>
                    ) : (
                      <img src={tempAvatar} alt="Current Profile" className="crop-preview-circle" />
                    )}
                  </div>

                  <div className="photo-actions-row">
                    <button 
                      type="button" 
                      className="photo-action-btn upload-btn" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera size={14} />
                      <span>{uploadedImage ? 'Change Image' : 'Upload Image'}</span>
                    </button>
                    
                    <button 
                      type="button" 
                      className="photo-action-btn remove-btn"
                      onClick={handleRemovePhoto}
                    >
                      <Trash2 size={14} />
                      <span>Remove</span>
                    </button>

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                    />
                  </div>

                  {uploadedImage && (
                    <div className="zoom-slider-container">
                      <span className="zoom-label">Zoom Crop Frame:</span>
                      <input 
                        type="range" 
                        min="1" 
                        max="3" 
                        step="0.05"
                        value={cropZoom}
                        onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                        className="zoom-slider"
                      />
                      <span className="zoom-instructions">Drag image to adjust crop center</span>
                    </div>
                  )}
                </div>

                {/* Full Name input */}
                <div className="edit-form-group">
                  <label className="edit-input-label">Full Name</label>
                  <input 
                    type="text" 
                    value={tempFullName} 
                    onChange={(e) => setTempFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="edit-input-field"
                    required
                  />
                </div>

                {/* Username input with validation check status */}
                <div className="edit-form-group">
                  <label className="edit-input-label">Username</label>
                  <div className="username-field-wrapper">
                    <span className="username-at-prefix">@</span>
                    <input 
                      type="text" 
                      value={tempUsername} 
                      onChange={(e) => setTempUsername(e.target.value.replace(/\s+/g, ''))}
                      placeholder="username"
                      className="edit-input-field username-input"
                      required
                    />
                  </div>
                  {usernameStatus.message && (
                    <span className={`username-status-msg ${usernameStatus.status}`}>
                      {usernameStatus.message}
                    </span>
                  )}
                </div>

                {/* Bio field limited to 150 chars */}
                <div className="edit-form-group">
                  <div className="edit-label-header">
                    <label className="edit-input-label">Bio</label>
                    <span className={`char-counter ${tempBio.length > 140 ? 'warning' : ''}`}>
                      {150 - tempBio.length} characters left
                    </span>
                  </div>
                  <textarea 
                    value={tempBio}
                    onChange={(e) => setTempBio(e.target.value.slice(0, 150))}
                    placeholder="Tell other sports enthusiasts about yourself..."
                    className="edit-input-field bio-textarea"
                    rows={3}
                  />
                </div>

                {/* Location input */}
                <div className="edit-form-group">
                  <label className="edit-input-label">Location</label>
                  <input 
                    type="text" 
                    value={tempLocation} 
                    onChange={(e) => setTempLocation(e.target.value)}
                    placeholder="City, Country"
                    className="edit-input-field"
                  />
                </div>

                {/* Interest Multi-select checkboxes */}
                <div className="edit-interests-section">
                  <span className="interests-header-title">Interests Setup</span>

                  {/* Sports */}
                  <div className="interests-sub-group">
                    <span className="interests-cat-label">Sports Interests</span>
                    <div className="interests-checkbox-grid">
                      {['Cricket', 'Football', 'Badminton', 'Running', 'Pickleball', 'Tennis', 'Basketball'].map(sportName => {
                        const isChecked = tempSports.includes(sportName);
                        return (
                          <label key={sportName} className={`interest-check-chip ${isChecked ? 'active' : ''}`}>
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setTempSports(prev => 
                                  prev.includes(sportName) ? prev.filter(s => s !== sportName) : [...prev, sportName]
                                );
                              }}
                              style={{ display: 'none' }}
                            />
                            <span>{sportName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Entertainment */}
                  <div className="interests-sub-group">
                    <span className="interests-cat-label">Entertainment & Socials</span>
                    <div className="interests-checkbox-grid">
                      {['Music', 'Open Mic', 'Food Events', 'Theatre', 'Movies', 'DJ Events', 'Comedy'].map(entName => {
                        const isChecked = tempEnt.includes(entName);
                        return (
                          <label key={entName} className={`interest-check-chip ${isChecked ? 'active' : ''}`}>
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setTempEnt(prev => 
                                  prev.includes(entName) ? prev.filter(e => e !== entName) : [...prev, entName]
                                );
                              }}
                              style={{ display: 'none' }}
                            />
                            <span>{entName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="edit-modal-buttons-row">
                  <button 
                    type="button" 
                    className="edit-form-btn cancel-btn"
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    Cancel
                  </button>

                  <button 
                    type="submit" 
                    className="edit-form-btn save-btn"
                  >
                    Save Changes
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------
          SHARE PROFILE BOTTOM SHEET / MODAL
          -------------------------------------------------- */}
      {isShareModalOpen && (
        <div className="ios-drawer-overlay share-profile-overlay" onClick={() => setIsShareModalOpen(false)}>
          <div className="ios-drawer-sheet share-profile-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => setIsShareModalOpen(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body">
              <h3 className="ios-drawer-title">Share Profile</h3>
              <p className="ios-drawer-subtitle">Connect with other players outside Zenex</p>

              {/* URL preview display */}
              <div className="share-url-preview-box">
                <span className="share-url-label">Your Profile Link</span>
                <div className="share-url-display-row">
                  <span className="share-url-text">{profileUrl}</span>
                  <button type="button" className="share-url-copy-btn" onClick={copyProfileLink} title="Copy Link">
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              {/* Share grid layout */}
              <div className="share-options-grid">
                <button type="button" className="share-grid-item" onClick={copyProfileLink}>
                  <div className="share-icon-wrap link-bg">
                    <LinkIcon size={20} />
                  </div>
                  <span className="share-item-label">Copy Link</span>
                </button>

                <button type="button" className="share-grid-item" onClick={shareWhatsApp}>
                  <div className="share-icon-wrap whatsapp-bg">
                    <MessageCircle size={20} />
                  </div>
                  <span className="share-item-label">WhatsApp</span>
                </button>

                <button type="button" className="share-grid-item" onClick={exportInstagramCard}>
                  <div className="share-icon-wrap instagram-bg">
                    <Camera size={20} />
                  </div>
                  <span className="share-item-label">Instagram Stories</span>
                </button>

                <button type="button" className="share-grid-item" onClick={shareFacebook}>
                  <div className="share-icon-wrap facebook-bg">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-facebook">
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                    </svg>
                  </div>
                  <span className="share-item-label">Facebook</span>
                </button>

                <button type="button" className="share-grid-item" onClick={shareX}>
                  <div className="share-icon-wrap twitter-bg">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-twitter">
                      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
                    </svg>
                  </div>
                  <span className="share-item-label">Share via X</span>
                </button>

                <button type="button" className="share-grid-item" onClick={shareEmail}>
                  <div className="share-icon-wrap email-bg">
                    <Mail size={20} />
                  </div>
                  <span className="share-item-label">Email</span>
                </button>

                <button type="button" className="share-grid-item" onClick={copyUsernameOnly}>
                  <div className="share-icon-wrap username-bg">
                    <UserIcon size={20} />
                  </div>
                  <span className="share-item-label">Copy Username</span>
                </button>
              </div>

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <button 
                  type="button" 
                  className="share-sheet-dismiss-btn"
                  onClick={() => setIsShareModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Drawer Mockup */}
      {isNotificationsOpen && (
        <div className="ios-drawer-overlay" onClick={() => setIsNotificationsOpen(false)}>
          <div className="ios-drawer-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => setIsNotificationsOpen(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body">
              <h3 className="ios-drawer-title">Notifications</h3>
              <p className="ios-drawer-subtitle">Stay connected with your matches</p>

              <div className="ios-notifications-list">
                <div className="ios-notification-item unread">
                  <div className="ios-notif-dot" />
                  <div className="ios-notif-info">
                    <span className="ios-notif-text"><strong>Rahul Sharma</strong> sent you a connection request.</span>
                    <span className="ios-notif-time">2h ago</span>
                  </div>
                </div>
                <div className="ios-notification-item">
                  <div className="ios-notif-info">
                    <span className="ios-notif-text">Cricket Match near <strong>Madhapur</strong> starts tomorrow.</span>
                    <span className="ios-notif-time">1d ago</span>
                  </div>
                </div>
                <div className="ios-notification-item">
                  <div className="ios-notif-info">
                    <span className="ios-notif-text">Your badge <strong>Event Organizer</strong> has been unlocked!</span>
                    <span className="ios-notif-time">3d ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apple Settings Bottom Modal Sheet Drawer */}
      {isSettingsOpen && (
        <div className="ios-drawer-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="ios-drawer-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => setIsSettingsOpen(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body scrollable">
              <h3 className="ios-drawer-title">Settings</h3>
              <p className="ios-drawer-subtitle">Manage your account preferences</p>
              
              {/* Membership Card */}
              <div className="ios-settings-membership-card">
                <div className="membership-card-user">
                  <img src={avatar} alt={fullName} className="membership-card-avatar" />
                  <div className="membership-card-info">
                    <span className="membership-card-name">{fullName}</span>
                    <div className="membership-card-plan-row">
                      <span className="membership-card-plan-label">Current Plan:</span>
                      <span className={`plan-badge-pill badge-${membershipPlan.toLowerCase()}`}>{membershipPlan}</span>
                    </div>
                  </div>
                </div>
                <button 
                  type="button" 
                  className="membership-card-upgrade-btn"
                  onClick={() => { setIsSettingsOpen(false); setIsMembershipOpen(true); }}
                >
                  Upgrade Plan
                </button>
              </div>

              <div className="ios-settings-list">
                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); handleOpenEdit(); }}>
                  <div className="settings-item-left">
                    <UserIcon size={16} className="settings-icon icon-blue" />
                    <span>Edit Profile</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); setIsMembershipOpen(true); }}>
                  <div className="settings-item-left">
                    <Sparkles size={16} className="settings-icon icon-yellow" />
                    <span>Membership ({membershipPlan})</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); alert('Configure notification preferences...'); }}>
                  <div className="settings-item-left">
                    <Bell size={16} className="settings-icon icon-pink" />
                    <span>Notifications</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); toggleTheme(); }}>
                  <div className="settings-item-left">
                    <Palette size={16} className="settings-icon icon-purple" />
                    <span>Appearance ({theme === 'light' ? 'Light' : 'Dark'})</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); alert('Adjust security levels...'); }}>
                  <div className="settings-item-left">
                    <Shield size={16} className="settings-icon icon-green" />
                    <span>Privacy & Security</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); alert('Open rewards menu...'); }}>
                  <div className="settings-item-left">
                    <Gift size={16} className="settings-icon icon-yellow" />
                    <span>Rewards & Badges</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); alert('Opening help files...'); }}>
                  <div className="settings-item-left">
                    <HelpCircle size={16} className="settings-icon icon-gray" />
                    <span>Help & Support</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <button type="button" className="ios-settings-item" onClick={() => { setIsSettingsOpen(false); alert('Opening Terms & Privacy Policies...'); }}>
                  <div className="settings-item-left">
                    <Shield size={16} className="settings-icon icon-gray" />
                    <span>Terms & Privacy</span>
                  </div>
                  <ChevronRight size={16} className="settings-arrow" />
                </button>

                <div className="ios-settings-divider" />

                <button type="button" className="ios-settings-logout-btn" onClick={handleLogout}>
                  <LogOut size={16} className="logout-icon" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Membership Modal */}
      <MembershipModal isOpen={isMembershipOpen} onClose={() => setIsMembershipOpen(false)} />
    </div>
  );
};

export default ProfileView;
