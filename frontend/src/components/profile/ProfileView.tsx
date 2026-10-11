import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronRight, 
  ChevronLeft,
  X, 
  Grid, 
  Bookmark, 
  Bell, 
  Settings, 
  Share2, 
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
  Trash2,
  Copy,
  Link as LinkIcon,
  Sparkles,
  Star,
  Users,
  Plus,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ThemeSwitch } from '../ThemeSwitch';
import { useTheme } from '../../themeContext';
import { MembershipModal, getSavedPlan, PLAN_CHANGE_EVENT, PlanType } from '../Membership/Membership';
import HomePostCard from '../HomeFeed/HomePostCard';
import { FEED_CHANGED_EVENT, isFollowing, toggleFollow } from '../HomeFeed/feedAlgorithm';
import { USER_POSTS_CHANGED_EVENT } from '../HomeFeed/publishContent';
import { saveProfile } from '../../api';
import { isBackendEnabled } from '../../api/client';
import { getCurrentViewerId } from '../ExplorePage/exploreEvents';
import { uploadFile } from '../../api/uploadApi';
import { fetchProfile } from '../../api/profileApi';
import { patchCachedStats, refreshStats, STATS_CHANGED_EVENT } from '../../api/statsApi';
import { requestPeople } from '../ExplorePage/exploreEvents';
import { usePeopleVersion } from '../../lib/usePeople';
import { useNotifications } from '../../lib/useNotifications';
import { NotificationsList } from '../NotificationsList';
import { initialAvatar } from '../../lib/avatar';
import { LIVE_SYNC_EVENT } from '../../lib/useLiveSync';
import {
  DAB_UPS_CHANGED_EVENT,
  getAchievementWins,
  getBoostersCount,
  getBoostingCount,
  getDabUpStatus,
  getDabUpsCount,
  getDabbedUpPeople,
  getEventsJoinedStats,
  getHostingStats,
  getMemberEventsJoinedStats,
  getMemberHostingStats,
  getMemberPosts,
  getMemberRankProgress,
  getMemberSocialCounts,
  getProfileOrganizer,
  getRankProgress,
  getUserPostsFeed,
  isOwnProfileUser,
  sendDabUpRequest,
} from './profileData';
import { fetchDabUpStatus, requestDabUp, respondDabUp } from '../../api/socialApi';
import type { DabUpStatus } from '../../api/types';
import { blockUser, deleteMyAccount, reportContent } from '../../api/trustApi';
import {
  canCreateCommunityRemote,
  createCommunityRemote,
  fetchCommunitiesByCreator,
  joinCommunityRemote,
} from '../../api/communitiesApi';
import { RANK_TIERS } from './rankConfig';
import { RankBadge } from './RankBadge';
import {
  createCommunity,
  canUserCreateCommunity,
  getCommunityAvatar,
  getVisibleCommunitiesForProfile,
  joinCommunity,
  subscribeCommunities,
  type Community,
} from './communitiesStore';
import { createDirectMessage } from '../Chat/chatStore';
import './ProfileView.css';

type TabType = 'posts' | 'events' | 'achievements' | 'saved' | 'communities';

const TAB_LABELS: Record<TabType, string> = {
  posts: 'Posts',
  events: 'Events',
  achievements: 'Achievements',
  saved: 'Saved',
  communities: 'Communities',
};

type ProfileViewProps = {
  userId?: string | null;
  onViewProfile?: (userId: string) => void;
  onBack?: () => void;
  onOpenChat?: (chatId: string) => void;
};

// Taken usernames list for real-time validation mockup
const TAKEN_USERNAMES = ['admin', 'neha', 'rahul', 'aisha', 'root', 'auth', 'sports', 'simsor', 'cricket', 'manager', 'football'];

export const ProfileView: React.FC<ProfileViewProps> = ({
  userId = null,
  onViewProfile,
  onBack,
  onOpenChat,
}) => {
  const isOwnProfile = isOwnProfileUser(userId);
  const profileUserId = isOwnProfile ? null : userId;
  usePeopleVersion(); // re-render when a real user's name / photo finishes loading
  const member = getProfileOrganizer(userId);
  const notifications = useNotifications();

  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    setActiveTab('posts');
  }, [userId]);
  
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
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);

  // Dynamic Profile states synchronized with localStorage
  const [fullName, setFullName] = useState(() => localStorage.getItem('simsor-fullname') || (isBackendEnabled() ? '' : 'Admin User'));
  const [username, setUsername] = useState(() => localStorage.getItem('simsor-username') || (isBackendEnabled() ? '' : 'admin'));
  const [bio, setBio] = useState(() => localStorage.getItem('simsor-bio') || (isBackendEnabled() ? '' : 'Sports Enthusiast • Event Explorer'));
  const [location, setLocation] = useState(() => localStorage.getItem('simsor-location') || (isBackendEnabled() ? '' : 'Hyderabad, India'));
  const [avatar, setAvatar] = useState(
    () =>
      localStorage.getItem('simsor-avatar') ||
      (isBackendEnabled()
        ? initialAvatar(localStorage.getItem('simsor-fullname') || localStorage.getItem('simsor-username') || '')
        : 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80'),
  );
  
  const [sports, setSports] = useState<string[]>(() => {
    const saved = localStorage.getItem('simsor-sports');
    return saved ? JSON.parse(saved) : isBackendEnabled() ? [] : ['Cricket', 'Football'];
  });
  const [entertainment, setEntertainment] = useState<string[]>(() => {
    const saved = localStorage.getItem('simsor-ent');
    return saved ? JSON.parse(saved) : isBackendEnabled() ? [] : ['Music', 'Food Events'];
  });

  // Stats — derived live from the profile data layer; statsTick forces refresh.
  const [statsTick, setStatsTick] = useState(0);
  const bumpStats = () => setStatsTick((v) => v + 1);

  // Real data: hydrate own profile from the server, pull real counters, and
  // keep them fresh while this screen is open.
  useEffect(() => {
    if (!isBackendEnabled()) return undefined;
    let cancelled = false;
    if (isOwnProfile) {
      void fetchProfile()
        .then((p) => {
          if (cancelled || !p) return;
          if (p.fullName) localStorage.setItem('simsor-fullname', p.fullName);
          if (p.username) localStorage.setItem('simsor-username', p.username);
          localStorage.setItem('simsor-bio', p.bio ?? '');
          localStorage.setItem('simsor-location', p.location ?? '');
          if (p.avatarUrl) localStorage.setItem('simsor-avatar', p.avatarUrl);
          else localStorage.removeItem('simsor-avatar');
          setFullName(p.fullName ?? '');
          setUsername(p.username ?? '');
          setBio(p.bio ?? '');
          setLocation(p.location ?? '');
          setAvatar(p.avatarUrl || initialAvatar(p.fullName || p.username));
          if (p.sports) setSports(p.sports);
          if (p.entertainment) setEntertainment(p.entertainment);
        })
        .catch(() => {});
    } else if (profileUserId) {
      requestPeople([profileUserId]);
    }
    const target = isOwnProfile ? null : profileUserId;
    void refreshStats(target, { force: true });
    const onTick = () => void refreshStats(target);
    window.addEventListener(LIVE_SYNC_EVENT, onTick);
    return () => {
      cancelled = true;
      window.removeEventListener(LIVE_SYNC_EVENT, onTick);
    };
  }, [isOwnProfile, profileUserId]);

  useEffect(() => {
    window.addEventListener(STATS_CHANGED_EVENT, bumpStats);
    window.addEventListener(DAB_UPS_CHANGED_EVENT, bumpStats);
    window.addEventListener(FEED_CHANGED_EVENT, bumpStats);
    window.addEventListener(USER_POSTS_CHANGED_EVENT, bumpStats);
    return () => {
      window.removeEventListener(STATS_CHANGED_EVENT, bumpStats);
      window.removeEventListener(DAB_UPS_CHANGED_EVENT, bumpStats);
      window.removeEventListener(FEED_CHANGED_EVENT, bumpStats);
      window.removeEventListener(USER_POSTS_CHANGED_EVENT, bumpStats);
    };
  }, []);

  /* eslint-disable react-hooks/exhaustive-deps */
  const dabUpsCount = React.useMemo(
    () => (isOwnProfile ? getDabUpsCount() : getMemberSocialCounts(profileUserId!).dabUps),
    [statsTick, isOwnProfile, profileUserId],
  );
  const boostersCount = React.useMemo(
    () => (isOwnProfile ? getBoostersCount() : getMemberSocialCounts(profileUserId!).boosters),
    [statsTick, isOwnProfile, profileUserId],
  );
  const boostingCount = React.useMemo(
    () => (isOwnProfile ? getBoostingCount() : getMemberSocialCounts(profileUserId!).boosting),
    [statsTick, isOwnProfile, profileUserId],
  );
  const eventsJoined = React.useMemo(
    () => (isOwnProfile ? getEventsJoinedStats() : getMemberEventsJoinedStats(profileUserId!)),
    [statsTick, isOwnProfile, profileUserId],
  );
  const hostingStats = React.useMemo(
    () => (isOwnProfile ? getHostingStats() : getMemberHostingStats(profileUserId!)),
    [statsTick, isOwnProfile, profileUserId],
  );
  const rank = React.useMemo(
    () => (isOwnProfile ? getRankProgress() : getMemberRankProgress(profileUserId!)),
    [statsTick, isOwnProfile, profileUserId],
  );
  const userPosts = React.useMemo(
    () => (isOwnProfile ? getUserPostsFeed() : getMemberPosts(profileUserId!)),
    [statsTick, isOwnProfile, profileUserId],
  );
  const achievementWins = React.useMemo(
    () => getAchievementWins(userId),
    [userId, statsTick],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const displayName = isOwnProfile ? fullName : member.name;
  const displayUsername = isOwnProfile ? username : member.username;
  const displayBio = isOwnProfile ? (bio || 'Add a short bio about yourself.') : member.bio;
  const displayAvatar = isOwnProfile ? avatar : member.avatar;
  const displayRole = isOwnProfile ? null : member.role;

  const [dabTick, setDabTick] = useState(0);
  const [remoteDabStatus, setRemoteDabStatus] = useState<DabUpStatus>('none');
  const [isRespondingDab, setIsRespondingDab] = useState(false);
  useEffect(() => {
    const onDab = () => setDabTick((v) => v + 1);
    window.addEventListener(DAB_UPS_CHANGED_EVENT, onDab);
    return () => window.removeEventListener(DAB_UPS_CHANGED_EVENT, onDab);
  }, []);

  useEffect(() => {
    if (isOwnProfile || !profileUserId || !isBackendEnabled()) return;
    void fetchDabUpStatus(profileUserId).then(setRemoteDabStatus);
  }, [isOwnProfile, profileUserId, dabTick]);

  const dabStatus = React.useMemo(() => {
    if (isOwnProfile || !profileUserId) return 'none';
    if (isBackendEnabled()) return remoteDabStatus;
    return getDabUpStatus(profileUserId);
  }, [isOwnProfile, profileUserId, dabTick, remoteDabStatus]);

  const handleDabUp = () => {
    if (!profileUserId || dabStatus !== 'none') return;
    if (isBackendEnabled()) {
      setRemoteDabStatus('pending');
      void requestDabUp(profileUserId)
        .then((status) => {
          setRemoteDabStatus(status);
          void refreshStats(null, { force: true });
          void refreshStats(profileUserId, { force: true });
          bumpStats();
          toast.success(
            status === 'dabbed_up' ? `You're dabbed up with ${displayName}!` : `Dab Up sent to ${displayName}`,
          );
        })
        .catch(() => {
          setRemoteDabStatus('none');
          toast.error('Could not send Dab Up. Try again.');
        });
      return;
    }
    sendDabUpRequest(profileUserId);
    toast.success(`Dab Up sent to ${displayName}`);
  };

  const handleRespondDab = (accept: boolean) => {
    if (!profileUserId || dabStatus !== 'incoming' || isRespondingDab) return;
    setIsRespondingDab(true);
    void respondDabUp(profileUserId, accept)
      .then((status) => {
        setRemoteDabStatus(status);
        setDabTick((v) => v + 1);
        void refreshStats(null, { force: true });
        void refreshStats(profileUserId, { force: true });
        bumpStats();
        toast.success(accept ? `You're dabbed up with ${displayName}!` : 'Dab Up request declined');
      })
      .catch(() => toast.error('Could not update the request. Try again.'))
      .finally(() => setIsRespondingDab(false));
  };

  const handleDeleteAccount = () => {
    if (!window.confirm('Delete your account permanently? This cannot be undone.')) return;
    void deleteMyAccount()
      .then(() => {
        window.location.href = '/login';
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not delete account');
      });
  };

  const boostTargetId = profileUserId ?? '';
  const [boostTick, setBoostTick] = useState(0);
  useEffect(() => {
    const onBoost = () => setBoostTick((v) => v + 1);
    window.addEventListener(FEED_CHANGED_EVENT, onBoost);
    return () => window.removeEventListener(FEED_CHANGED_EVENT, onBoost);
  }, []);
  const isBoosting = React.useMemo(
    () => (boostTargetId ? isFollowing(boostTargetId) : false),
    [boostTargetId, boostTick],
  );

  const handleBoost = () => {
    if (!profileUserId) return;
    const nowFollowing = toggleFollow(profileUserId);
    const delta = nowFollowing ? 1 : -1;
    patchCachedStats(null, { following: Math.max(0, getBoostingCount() + delta) });
    patchCachedStats(profileUserId, { followers: Math.max(0, getMemberSocialCounts(profileUserId).boosters + delta) });
    bumpStats();
    void refreshStats(null, { force: true });
    void refreshStats(profileUserId, { force: true });
    toast.success(nowFollowing ? `Boosting ${displayName}` : `Stopped boosting ${displayName}`);
  };

  const [isStartingChat, setIsStartingChat] = useState(false);
  const handleMessage = async () => {
    if (!profileUserId || isStartingChat) return;
    setIsStartingChat(true);
    const conversation = await createDirectMessage(profileUserId);
    setIsStartingChat(false);
    if (conversation) {
      onOpenChat?.(conversation.id);
    } else {
      toast.error('Messaging is unavailable right now');
    }
  };

  // Rank ladder modal
  const [isRankModalOpen, setIsRankModalOpen] = useState(false);
  const [eventsBreakdownOpen, setEventsBreakdownOpen] = useState(false);

  // Communities
  const [communities, setCommunities] = useState<Community[]>(() =>
    getVisibleCommunitiesForProfile(profileUserId, isOwnProfile),
  );
  const [communityName, setCommunityName] = useState('');
  const [communityDescription, setCommunityDescription] = useState('');
  const [communityAvatar, setCommunityAvatar] = useState(avatar);
  const [communityMemberIds, setCommunityMemberIds] = useState<string[]>([]);
  const communityPhotoRef = useRef<HTMLInputElement>(null);
  const communityUploadingRef = useRef(false);

  const dabbedPeople = React.useMemo(
    () => (isCreateCommunityOpen ? getDabbedUpPeople() : []),
    [isCreateCommunityOpen, dabUpsCount],
  );

  const resetCreateCommunityForm = () => {
    setCommunityName('');
    setCommunityDescription('');
    setCommunityAvatar(avatar);
    setCommunityMemberIds([]);
  };

  const toggleCommunityMember = (memberId: string) => {
    setCommunityMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  };

  const handleCommunityPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setCommunityAvatar(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';

    // Live backend: store the photo for real so the community avatar is a
    // stable server URL (not a giant base64 string) everyone can see.
    if (isBackendEnabled()) {
      communityUploadingRef.current = true;
      const toastId = toast.loading('Uploading community photo...');
      uploadFile(file, file.name)
        .then((res) => {
          setCommunityAvatar(res.url);
          toast.success('Photo uploaded', { id: toastId });
        })
        .catch(() => toast.error('Could not upload the photo', { id: toastId }))
        .finally(() => {
          communityUploadingRef.current = false;
        });
    }
  };

  // Hide bottom nav island while profile sheets are open
  useEffect(() => {
    const root = document.documentElement;
    const hideNav = isEditModalOpen || isCreateCommunityOpen;
    root.classList.toggle('profile-sheet-open', hideNav);
    root.classList.toggle('create-community-open', isCreateCommunityOpen);
    return () => {
      root.classList.remove('profile-sheet-open');
      root.classList.remove('create-community-open');
    };
  }, [isEditModalOpen, isCreateCommunityOpen]);

  useEffect(() => {
    if (isBackendEnabled() && profileUserId) {
      void fetchCommunitiesByCreator(isOwnProfile ? getCurrentViewerId() : profileUserId).then(
        setCommunities,
      );
      return subscribeCommunities(() => {
        void fetchCommunitiesByCreator(isOwnProfile ? getCurrentViewerId() : profileUserId!).then(
          setCommunities,
        );
      });
    }
    setCommunities(getVisibleCommunitiesForProfile(profileUserId, isOwnProfile));
    return subscribeCommunities(() => {
      setCommunities(getVisibleCommunitiesForProfile(profileUserId, isOwnProfile));
    });
  }, [profileUserId, isOwnProfile]);

  const handleCreateCommunity = (e: React.FormEvent) => {
    e.preventDefault();
    if (communityUploadingRef.current) {
      toast.error('Photo is still uploading - one moment');
      return;
    }
    const canCreate = isBackendEnabled() ? canCreateCommunityRemote() : canUserCreateCommunity();
    if (!canCreate) {
      toast.error('You can only create one community for now');
      setIsCreateCommunityOpen(false);
      return;
    }
    const run = async () => {
      const created = isBackendEnabled()
        ? await createCommunityRemote({
            name: communityName,
            avatarUrl: communityAvatar,
            memberIds: communityMemberIds,
          })
        : createCommunity({
            name: communityName,
            description: communityDescription,
            avatar: communityAvatar,
            memberIds: communityMemberIds,
          });
      if (!created) {
        toast.error('Enter a community name');
        return;
      }
      toast.success(`"${created.name}" created — chat is ready`);
      setIsCreateCommunityOpen(false);
      resetCreateCommunityForm();
      onOpenChat?.(created.chatId);
    };
    void run();
  };

  const openCommunityChat = (chatId: string) => {
    onOpenChat?.(chatId);
  };

  const handleCommunityClick = (community: Community) => {
    if (!isOwnProfile) {
      if (isBackendEnabled()) void joinCommunityRemote(community.id);
      else joinCommunity(community.id);
    }
    openCommunityChat(community.chatId);
  };

  const handleReportProfile = () => {
    if (!profileUserId || isOwnProfile) return;
    void reportContent({ targetType: 'user', targetId: profileUserId, reason: 'other' }).then(() =>
      toast.success('Report submitted'),
    );
  };

  const handleBlockProfile = () => {
    if (!profileUserId || isOwnProfile) return;
    if (!window.confirm('Block this user?')) return;
    void blockUser(profileUserId).then(() => toast.success('User blocked'));
  };

  // Hero avatar ↔ badge swap + long-press zoom
  const [heroShowBadge, setHeroShowBadge] = useState(false);
  const [heroActionMenuOpen, setHeroActionMenuOpen] = useState(false);
  const [heroZoomView, setHeroZoomView] = useState<'avatar' | 'badge' | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (heroActionMenuOpen || heroZoomView) return undefined;
    const id = window.setInterval(() => setHeroShowBadge((v) => !v), 3000);
    return () => clearInterval(id);
  }, [heroActionMenuOpen, heroZoomView]);

  const clearHeroLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleHeroSwapPointerDown = () => {
    clearHeroLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      setHeroActionMenuOpen(true);
    }, 480);
  };

  const handleHeroSwapPointerUp = () => {
    clearHeroLongPress();
  };

  const openHeroZoom = (view: 'avatar' | 'badge') => {
    setHeroActionMenuOpen(false);
    setHeroZoomView(view);
  };

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
  const [removePhoto, setRemovePhoto] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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
        setRemovePhoto(false);
        setUploadedImage(reader.result as string);
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Image Drag crop handlers
  const handleMouseDown = (e: React.PointerEvent) => {
    if (!uploadedImage) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y });
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    if (!isDragging || !uploadedImage) return;
    setCropOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Canvas crop: renders exactly what the 120px preview shows (cover-fit, zoom
  // around the centre, then the drag offset) into a crisp 400px circle-ready JPEG.
  const performCrop = (): Promise<string | null> =>
    new Promise((resolve) => {
      if (!uploadedImage) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const size = 400;
        const preview = 120;
        const k = size / preview;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        const cover = Math.max(preview / img.width, preview / img.height);
        ctx.translate(size / 2 + cropOffset.x * k, size / 2 + cropOffset.y * k);
        ctx.scale(cropZoom * k, cropZoom * k);
        ctx.drawImage(img, (-img.width * cover) / 2, (-img.height * cover) / 2, img.width * cover, img.height * cover);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(null);
      img.src = uploadedImage;
    });

  /** Cropped avatars are produced as base64 data URLs (canvas.toDataURL);
   * a live backend needs a real File/Blob to POST to /api/uploads. */
  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  const handleRemovePhoto = () => {
    setTempAvatar(
      isBackendEnabled()
        ? initialAvatar(tempFullName || fullName)
        : 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80',
    );
    setRemovePhoto(true);
    setUploadedImage(null);
    toast.success('Profile photo removed');
  };

  // Save changes callback
  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tempFullName.trim()) {
      toast.error('Full Name cannot be empty');
      return;
    }

    if (usernameStatus.status === 'taken' || usernameStatus.status === 'invalid') {
      toast.error('Please fix the username errors before saving');
      return;
    }

    let finalAvatar = isBackendEnabled() && removePhoto && !uploadedImage ? '' : tempAvatar;
    if (uploadedImage) {
      const cropped = await performCrop();
      if (cropped) finalAvatar = cropped;
    }

    setIsSavingProfile(true);
    try {
      // A live backend gets the real cropped photo uploaded to R2/local-disk
      // storage (see backend/app/storage.py) so `avatarUrl` becomes a real,
      // stable server URL instead of a multi-hundred-KB base64 string stuffed
      // into the users table.
      if (isBackendEnabled() && uploadedImage && finalAvatar.startsWith('data:')) {
        try {
          const uploaded = await uploadFile(dataUrlToBlob(finalAvatar), 'avatar.jpg');
          finalAvatar = uploaded.url;
        } catch {
          toast.error('Could not upload the photo — saving the rest of your profile.');
        }
      }

      const saved = await saveProfile({
        fullName: tempFullName.trim(),
        username: tempUsername.trim().toLowerCase(),
        bio: tempBio,
        location: tempLocation.trim(),
        avatarUrl: finalAvatar,
        sports: tempSports,
        entertainment: tempEnt,
      });

      setFullName(saved.fullName);
      setUsername(saved.username);
      setBio(saved.bio);
      setLocation(saved.location);
      setAvatar(saved.avatarUrl || (isBackendEnabled() ? initialAvatar(saved.fullName) : avatar));
      setRemovePhoto(false);
      setUploadedImage(null);
      setSports(saved.sports);
      setEntertainment(saved.entertainment);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // --------------------------------------------------
  // SHARE PROFILE ACTIONS
  // --------------------------------------------------
  const profileUrl = `https://simsor.app/u/${displayUsername}`;

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
    navigator.clipboard.writeText(`@${displayUsername}`)
      .then(() => {
        toast.success('Username copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy username');
      });
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Check out my Simsor profile: ${profileUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`, '_blank');
  };

  const shareX = () => {
    const text = encodeURIComponent(`Check out my premium Simsor sports and entertainment profile!`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(profileUrl)}`, '_blank');
  };

  const shareEmail = () => {
    window.location.href = `mailto:?subject=Check%20out%20my%20Simsor%20profile&body=Here%20is%20my%20Simsor%20profile%20link%3A%20${encodeURIComponent(profileUrl)}`;
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
    ctx.fillText('SIMSOR', 270, 160);

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
      drawStatCol(statX1, dabUpsCount.toString(), 'Dab Ups');
      drawStatCol(statX2, boostersCount.toString(), 'Boosters');
      drawStatCol(statX3, eventsJoined.attendedTotal.toString(), 'Events');

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

      // Draw Center Gold Simsor Star (Mock Branding)
      ctx.fillStyle = '#E9DCBE';
      ctx.fillRect(qrX + qrSize / 2 - 15, qrY + qrSize / 2 - 15, 30, 30);
      ctx.fillStyle = '#343434';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Z', qrX + qrSize / 2, qrY + qrSize / 2 + 8);

      // Footer
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = '#8E8B82';
      ctx.fillText('SCAN QR CODE TO VIEW PROFILE', cx, 770);
      ctx.fillText('simsor.app/u/' + username, cx, 790);

      // Export/Download trigger
      const link = document.createElement('a');
      link.download = `${username}_simsor_profile.png`;
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
    if (statLabel === 'Dab Ups' && dabUpsCount === 0) {
      toast('No Dab Ups yet — find people on Discover.');
    } else if (statLabel === 'Boosters' && boostersCount === 0) {
      toast('No Boosters yet.');
    } else if (statLabel === 'Boosting' && boostingCount === 0) {
      toast('Not boosting anyone yet.');
    } else if (statLabel === 'Posts' && userPosts.length === 0) {
      toast('No posts yet — share something in Base.');
    } else {
      toast(`Tapped on ${statLabel} details.`);
    }
  };

  const handleLogout = () => {
    toast.success('Logged out successfully');
  };

  return (
    <div
      className="profile-page"
      style={{ '--rank-color': rank.tier.color, '--rank-tint': rank.tier.tint } as React.CSSProperties}
    >
      <canvas ref={cropCanvasRef} style={{ display: 'none' }} />

      {/* Top half of the phone — identity hero */}
      <div className="profile-top-half">
        <div className="profile-top-bar">
          <div className="profile-top-bar-start">
            {isOwnProfile ? (
              <span className="profile-top-side" aria-hidden="true" />
            ) : (
              <button type="button" className="profile-back-bar" onClick={onBack} aria-label="Back to your profile">
                <ChevronLeft size={18} />
                <span>{displayName}</span>
              </button>
            )}
          </div>

          <div className="profile-top-bar-center">
            <p className="profile-top-handle" aria-label={`@${displayUsername}`}>
              @{displayUsername}
            </p>
          </div>

          <div className="profile-top-bar-end">
            <button
              type="button"
              className="profile-top-share"
              onClick={() => setIsShareModalOpen(true)}
              aria-label="Share profile"
            >
              <Share2 size={18} />
            </button>
          </div>
        </div>

        <div className="profile-hero-wrap">
        <section className="profile-hero">
          <div className="profile-hero-content">
            <div className="profile-hero-head">
              <div
                className="profile-hero-swap"
                style={{ '--rank-color': rank.tier.color, '--rank-tint': rank.tier.tint } as React.CSSProperties}
                onPointerDown={handleHeroSwapPointerDown}
                onPointerUp={handleHeroSwapPointerUp}
                onPointerLeave={handleHeroSwapPointerUp}
                onPointerCancel={handleHeroSwapPointerUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setHeroActionMenuOpen(true);
                }}
                role="button"
                tabIndex={0}
                aria-label="Profile photo and rank badge. Long press to view."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHeroActionMenuOpen(true);
                  }
                }}
              >
                <div className={`profile-hero-swap-coin${heroShowBadge ? ' is-flipped' : ''}`}>
                  <div className="profile-hero-swap-face profile-hero-swap-face--avatar">
                    <img src={displayAvatar} alt={`${displayName} profile`} className="profile-hero-swap-avatar" draggable={false} />
                  </div>
                  <div className="profile-hero-swap-face profile-hero-swap-face--badge">
                    <RankBadge tierId={rank.tier.id} size={88} className="profile-hero-swap-badge" />
                  </div>
                </div>
              </div>

              <div className="profile-identity">
                <div className="profile-name-row">
                  <h1 className="profile-name">{displayName}</h1>
                  {isOwnProfile && (
                    <span className="profile-verified" title="Verified">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </div>
                {displayRole && <span className="profile-role">{displayRole}</span>}
              </div>
            </div>

            <p className={`profile-bio${isOwnProfile && !bio ? ' profile-bio--empty' : ''}`}>
              {displayBio}
            </p>
          </div>

          {isOwnProfile ? (
            <button
              type="button"
              className="profile-hero-edit-btn"
              onClick={handleOpenEdit}
            >
              <UserIcon size={13} />
              Edit Profile
            </button>
          ) : (
            <>
            {dabStatus === 'incoming' && (
              <div className="profile-dab-request">
                <p className="profile-dab-request-text">
                  <strong>{displayName}</strong> wants to Dab Up with you
                </p>
                <div className="profile-dab-request-actions">
                  <button
                    type="button"
                    className="profile-dab-request-btn profile-dab-request-btn--confirm"
                    onClick={() => handleRespondDab(true)}
                    disabled={isRespondingDab}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="profile-dab-request-btn"
                    onClick={() => handleRespondDab(false)}
                    disabled={isRespondingDab}
                  >
                    Deny
                  </button>
                </div>
              </div>
            )}
            <div className="profile-hero-actions">
              {dabStatus !== 'incoming' && (
                <button
                  type="button"
                  className={`profile-action-btn profile-action-btn--primary ${dabStatus === 'dabbed_up' ? 'profile-action-btn--dabbed' : ''}`}
                  onClick={handleDabUp}
                  disabled={dabStatus !== 'none'}
                >
                  {dabStatus === 'dabbed_up' ? 'Dabbed Up' : dabStatus === 'pending' ? 'Pending…' : 'Dab Up'}
                </button>
              )}
              <button
                type="button"
                className={`profile-action-btn ${isBoosting ? 'profile-action-btn--boosting' : 'profile-action-btn--primary'}`}
                onClick={handleBoost}
              >
                {isBoosting ? 'Boosting' : 'Boost'}
              </button>
              {isBackendEnabled() && (
                <button
                  type="button"
                  className="profile-action-btn"
                  onClick={handleMessage}
                  disabled={isStartingChat}
                >
                  {isStartingChat ? 'Opening…' : 'Message'}
                </button>
              )}
              {isBackendEnabled() && (
                <>
                  <button type="button" className="profile-action-btn profile-action-btn--muted" onClick={handleReportProfile}>
                    Report
                  </button>
                  <button type="button" className="profile-action-btn profile-action-btn--muted" onClick={handleBlockProfile}>
                    Block
                  </button>
                </>
              )}
            </div>
            </>
          )}
        </section>
        </div>

        <div className="profile-stats-row profile-stats-row--hero">
          <button type="button" className="profile-stat" onClick={() => handleStatClick('Dab Ups')}>
            <span className="profile-stat-value">{dabUpsCount}</span>
            <span className="profile-stat-label">Dab Ups</span>
          </button>
          <button type="button" className="profile-stat" onClick={() => handleStatClick('Boosters')}>
            <span className="profile-stat-value">{boostersCount}</span>
            <span className="profile-stat-label">Boosters</span>
          </button>
          <button type="button" className="profile-stat" onClick={() => handleStatClick('Boosting')}>
            <span className="profile-stat-value">{boostingCount}</span>
            <span className="profile-stat-label">Boosting</span>
          </button>
          <button type="button" className="profile-stat" onClick={() => handleStatClick('Posts')}>
            <span className="profile-stat-value">{userPosts.length}</span>
            <span className="profile-stat-label">Posts</span>
          </button>
        </div>
      </div>

      <div className="profile-bottom-half">
      {/* XP progress — rank name matches hero badge */}
      <button
        type="button"
        className="profile-xp-line"
        onClick={() => setIsRankModalOpen(true)}
        style={{ '--rank-color': rank.tier.color, '--rank-tint': rank.tier.tint } as React.CSSProperties}
      >
        <div className="profile-xp-line-head">
          <span className="profile-xp-line-name">{rank.tier.name}</span>
          <span className="profile-xp-line-xp">{rank.xp.toLocaleString()} XP</span>
        </div>
        {rank.isMaxRank ? (
          <span className="profile-xp-line-max">MAX RANK</span>
        ) : (
          <>
            <div className="profile-xp-line-bar">
              <div
                className="profile-xp-line-bar-fill"
                style={{ width: `${Math.round(rank.progress * 100)}%` }}
              />
            </div>
            <span className="profile-xp-line-next">
              {rank.xpIntoTier.toLocaleString()} / {rank.xpTierSpan.toLocaleString()} XP to {rank.nextTier?.name}
            </span>
          </>
        )}
        <ChevronRight size={14} className="profile-xp-line-chevron" aria-hidden="true" />
      </button>

      {/* Tabs */}
      <div className="profile-tabs">
        {(['posts', 'events', 'achievements', 'saved', 'communities'] as TabType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="profile-tab-body">
        {activeTab === 'posts' && (
          <div className="profile-base-feed animate-fadeIn">
            {userPosts.length === 0 ? (
              <div className="profile-empty">
                <Grid size={32} strokeWidth={1.5} />
                <h3>No posts yet</h3>
                <p>
                  {isOwnProfile
                    ? 'No posts yet — share something in Base to get started.'
                    : `${displayName} hasn't posted anything yet.`}
                </p>
              </div>
            ) : (
              userPosts.map((post) => (
                <HomePostCard
                  key={post.id}
                  post={post}
                  onViewHostProfile={onViewProfile ?? (() => {})}
                  onViewAuthorProfile={onViewProfile ?? (() => {})}
                  onViewLocation={() => toast('Open Explore to view the event location')}
                  onFollowChange={bumpStats}
                  onPostDeleted={bumpStats}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="profile-events-blocks animate-fadeIn">
            <div className="profile-block-card">
              <div className="profile-block-head">
                <span className="profile-block-title">Events attended</span>
                <span className="profile-block-big-value">{eventsJoined.attendedTotal}</span>
              </div>

              {eventsJoined.attendedTotal === 0 ? (
                <p className="profile-block-empty">
                  Join and check in to events to start building your attendance record.
                  {eventsJoined.registeredUpcoming > 0 &&
                    ` You have ${eventsJoined.registeredUpcoming} upcoming registration${eventsJoined.registeredUpcoming > 1 ? 's' : ''}.`}
                </p>
              ) : (
                <>
                  {eventsJoined.registeredUpcoming > 0 && (
                    <p className="profile-block-note">
                      +{eventsJoined.registeredUpcoming} upcoming registered
                    </p>
                  )}
                  <button
                    type="button"
                    className="profile-breakdown-toggle"
                    onClick={() => setEventsBreakdownOpen((v) => !v)}
                  >
                    See breakdown
                    <ChevronDown
                      size={14}
                      style={{
                        transform: eventsBreakdownOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </button>
                  {eventsBreakdownOpen && (
                    <div className="profile-breakdown-list">
                      {eventsJoined.byCategory.map(({ category, count }) => (
                        <div key={category} className="profile-breakdown-row">
                          <span className="profile-breakdown-cat">{category}</span>
                          <div className="profile-breakdown-bar">
                            <div
                              className="profile-breakdown-bar-fill"
                              style={{
                                width: `${Math.round((count / eventsJoined.attendedTotal) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="profile-breakdown-count">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="profile-block-card">
              <div className="profile-block-head">
                <span className="profile-block-title">Hosting</span>
                {hostingStats.hostedTotal > 0 && (
                  <span className="profile-block-big-value">{hostingStats.hostedTotal}</span>
                )}
              </div>

              {hostingStats.hostedTotal === 0 ? (
                <p className="profile-block-empty">
                  Host your first official event to start building your rating.
                </p>
              ) : (
                <>
                  <div className="profile-hosting-rating">
                    <Star size={16} className="profile-hosting-star" fill="currentColor" />
                    <span className="profile-hosting-avg">{hostingStats.avgRating.toFixed(1)}</span>
                    <span className="profile-hosting-count">
                      ({hostingStats.ratingCount} rating{hostingStats.ratingCount !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="profile-hosted-list">
                    {hostingStats.events.map(({ post, rating, ratingCount }) => (
                      <div key={post.id} className="profile-hosted-row">
                        <span className="profile-hosted-title">{post.eventTitle}</span>
                        <span className="profile-hosted-rating">
                          <Star size={11} fill="currentColor" /> {rating.toFixed(1)} ({ratingCount})
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="profile-achievements-feed animate-fadeIn">
            {achievementWins.length === 0 ? (
              <div className="profile-empty">
                <Star size={32} strokeWidth={1.5} />
                <h3>No achievements yet</h3>
                <p>
                  {isOwnProfile
                    ? 'Win an official event to post your victory here.'
                    : `${displayName} hasn't posted any official wins yet.`}
                </p>
              </div>
            ) : (
              achievementWins.map((win) => (
                <article key={win.id} className="profile-win-card">
                  <div className="profile-win-image-wrap">
                    <img src={win.image} alt="" className="profile-win-image" loading="lazy" />
                    <span className="profile-win-placement">{win.placement}</span>
                  </div>
                  <div className="profile-win-body">
                    <div className="profile-win-meta">
                      <span className="profile-win-official">Official Event</span>
                      <span className="profile-win-date">{win.dateLabel}</span>
                    </div>
                    <h3 className="profile-win-title">{win.eventTitle}</h3>
                    <p className="profile-win-caption">{win.caption}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="profile-empty animate-fadeIn">
            <Bookmark size={32} strokeWidth={1.5} />
            <h3>No saved items</h3>
            <p>Save events or posts for quick access later.</p>
          </div>
        )}

        {activeTab === 'communities' && (
          <div className="profile-communities animate-fadeIn">
            {isOwnProfile && canUserCreateCommunity() && (
              <button
                type="button"
                className="profile-create-community-btn"
                onClick={() => {
                  setCommunityAvatar(avatar);
                  setIsCreateCommunityOpen(true);
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
                Create Community
              </button>
            )}

            {communities.length === 0 ? (
              <div className="profile-empty profile-empty--inline">
                <Users size={32} strokeWidth={1.5} />
                <h3>{isOwnProfile ? 'No communities yet' : 'No communities'}</h3>
                <p>
                  {isOwnProfile
                    ? 'Create one public community to gather your people — a chat is set up automatically.'
                    : `${displayName} hasn't created a community yet.`}
                </p>
              </div>
            ) : (
              <div className="profile-community-list">
                {communities.map((community) => (
                  <button
                    key={community.id}
                    type="button"
                    className="profile-community-card"
                    onClick={() => handleCommunityClick(community)}
                  >
                    <span className="profile-community-icon" aria-hidden="true">
                      <img
                        src={getCommunityAvatar(community)}
                        alt=""
                        className="profile-community-avatar"
                      />
                    </span>
                    <span className="profile-community-copy">
                      <span className="profile-community-name">{community.name}</span>
                      {community.description && (
                        <span className="profile-community-desc">{community.description}</span>
                      )}
                    </span>
                    <ChevronRight size={16} className="profile-community-chevron" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* --------------------------------------------------
          CREATE COMMUNITY MODAL
          -------------------------------------------------- */}
      {isOwnProfile && isCreateCommunityOpen && canUserCreateCommunity() && (
        <div
          className="ios-drawer-overlay create-community-overlay"
          onClick={() => {
            setIsCreateCommunityOpen(false);
            resetCreateCommunityForm();
          }}
        >
          <div
            className="ios-drawer-sheet create-community-sheet animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-community-handle" aria-hidden="true" />

            <div className="create-community-header">
              <div className="create-community-header-icon">
                <Users size={22} strokeWidth={2} />
              </div>
              <div className="create-community-header-text">
                <h3 className="create-community-title">Create Community</h3>
                <p className="create-community-lead">
                  One public community per profile — a chat opens instantly when you&apos;re done.
                </p>
              </div>
              <button
                className="create-community-close"
                onClick={() => {
            setIsCreateCommunityOpen(false);
            resetCreateCommunityForm();
          }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCommunity} className="create-community-form">
              <div className="create-community-body scrollable">
                <div className="create-community-photo-field">
                  <button
                    type="button"
                    className="create-community-photo-btn"
                    onClick={() => communityPhotoRef.current?.click()}
                    aria-label="Upload community photo"
                  >
                    <img src={communityAvatar} alt="" className="create-community-photo-preview" />
                    <span className="create-community-photo-badge">
                      <Camera size={14} />
                    </span>
                  </button>
                  <div className="create-community-photo-copy">
                    <strong>Community photo</strong>
                    <span>Starts with your profile photo — tap to change</span>
                  </div>
                  <input
                    ref={communityPhotoRef}
                    type="file"
                    accept="image/*"
                    className="create-community-photo-input"
                    onChange={handleCommunityPhotoChange}
                  />
                </div>

                <label className="create-community-field">
                  <span className="create-community-label">Group name</span>
                  <input
                    type="text"
                    className="create-community-input"
                    value={communityName}
                    onChange={(e) => setCommunityName(e.target.value)}
                    placeholder="Weekend Football Crew"
                    maxLength={48}
                    autoFocus
                  />
                </label>

                <label className="create-community-field">
                  <span className="create-community-label">
                    About <span className="create-community-optional">optional</span>
                  </span>
                  <textarea
                    className="create-community-textarea"
                    value={communityDescription}
                    onChange={(e) => setCommunityDescription(e.target.value)}
                    placeholder="What's this community about?"
                    rows={3}
                    maxLength={160}
                  />
                </label>

                <div className="create-community-field">
                  <span className="create-community-label">Add people you Dabbed Up with</span>
                  <p className="create-community-members-hint">
                    Selected members join the community chat right away.
                  </p>
                  {dabbedPeople.length === 0 ? (
                    <p className="create-community-members-empty">
                      Dab Up with people on Discover first — they&apos;ll show up here.
                    </p>
                  ) : (
                    <div className="create-community-members">
                      {dabbedPeople.map((person) => {
                        const isSelected = communityMemberIds.includes(person.id);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            className={`create-community-member-row${isSelected ? ' is-selected' : ''}`}
                            onClick={() => toggleCommunityMember(person.id)}
                            aria-pressed={isSelected}
                          >
                            <img src={person.avatar} alt="" className="create-community-member-avatar" />
                            <span className="create-community-member-meta">
                              <strong>{person.name}</strong>
                              <small>@{person.username}</small>
                            </span>
                            <span className="create-community-member-check" aria-hidden="true">
                              {isSelected && <Check size={14} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="create-community-footer">
                <button
                  type="submit"
                  className="create-community-submit"
                  disabled={!communityName.trim()}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Create & open chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------
          EDIT PROFILE MODAL
          -------------------------------------------------- */}
      {isOwnProfile && isEditModalOpen && (
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
                        style={{ touchAction: 'none' }}
                        onPointerDown={handleMouseDown}
                        onPointerMove={handleMouseMove}
                        onPointerUp={handleMouseUp}
                        onPointerCancel={handleMouseUp}
                        onPointerLeave={handleMouseUp}
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
                      {['Cricket', 'Football', 'Badminton', 'Running', 'Pickleball', 'Tennis', 'Basketball', 'Skateboard', 'Swimming'].map(sportName => {
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
                    disabled={isSavingProfile}
                  >
                    Cancel
                  </button>

                  <button 
                    type="submit" 
                    className="edit-form-btn save-btn"
                    disabled={isSavingProfile}
                  >
                    {isSavingProfile ? 'Saving…' : 'Save Changes'}
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
              <p className="ios-drawer-subtitle">Connect with other players outside Simsor</p>

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
        <div className="ios-drawer-overlay" onClick={() => { setIsNotificationsOpen(false); void notifications.markAllRead(); }}>
          <div className="ios-drawer-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => { setIsNotificationsOpen(false); void notifications.markAllRead(); }} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body">
              <h3 className="ios-drawer-title">Notifications</h3>
              <p className="ios-drawer-subtitle">Stay connected with your matches</p>

              {isBackendEnabled() ? (
                <NotificationsList items={notifications.items} />
              ) : (
              <div className="ios-notifications-list">
                <div className="ios-notification-item unread">
                  <div className="ios-notif-dot" />
                  <div className="ios-notif-info">
                    <span className="ios-notif-text"><strong>Rahul Sharma</strong> wants to Dab Up with you.</span>
                    <span className="ios-notif-time">2h ago</span>
                  </div>
                </div>
                <div className="ios-notification-item">
                  <div className="ios-notif-info">
                    <span className="ios-notif-text"><strong>Neha Reddy</strong> started boosting you.</span>
                    <span className="ios-notif-time">5h ago</span>
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Apple Settings Bottom Modal Sheet Drawer */}
      {isOwnProfile && isSettingsOpen && (
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

                {isBackendEnabled() && (
                  <button type="button" className="ios-settings-logout-btn danger" onClick={handleDeleteAccount}>
                    <Trash2 size={16} className="logout-icon" />
                    <span>Delete Account</span>
                  </button>
                )}

                <button type="button" className="ios-settings-logout-btn" onClick={handleLogout}>
                  <LogOut size={16} className="logout-icon" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Long-press: view photo or badge */}
      {heroActionMenuOpen && (
        <div className="ios-drawer-overlay profile-hero-action-overlay" onClick={() => setHeroActionMenuOpen(false)}>
          <div className="profile-hero-action-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="profile-hero-action-option" onClick={() => openHeroZoom('avatar')}>
              View Photo
            </button>
            <button type="button" className="profile-hero-action-option" onClick={() => openHeroZoom('badge')}>
              View Badge
            </button>
            <button type="button" className="profile-hero-action-cancel" onClick={() => setHeroActionMenuOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {heroZoomView && (
        <div className="profile-hero-zoom-overlay" onClick={() => setHeroZoomView(null)}>
          <button
            type="button"
            className="profile-hero-zoom-close"
            onClick={() => setHeroZoomView(null)}
            aria-label="Close"
          >
            <X size={22} />
          </button>
          <div className="profile-hero-zoom-stage" onClick={(e) => e.stopPropagation()}>
            {heroZoomView === 'avatar' ? (
              <img
                src={displayAvatar}
                alt={`${displayName} profile photo`}
                className="profile-hero-zoom-img profile-hero-zoom-img--avatar"
                draggable={false}
              />
            ) : (
              <img
                src={rank.tier.badgeImage}
                alt={`${rank.tier.name} rank badge`}
                className="profile-hero-zoom-img profile-hero-zoom-img--badge"
                draggable={false}
              />
            )}
          </div>
        </div>
      )}

      {/* Rank ladder modal */}
      {isRankModalOpen && (
        <div className="ios-drawer-overlay" onClick={() => setIsRankModalOpen(false)}>
          <div className="ios-drawer-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => setIsRankModalOpen(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body scrollable">
              <h3 className="ios-drawer-title">Rank Ladder</h3>
              <p className="ios-drawer-subtitle">
                {rank.isMaxRank
                  ? 'You reached the top of the ladder.'
                  : `${(rank.xpTierSpan - rank.xpIntoTier).toLocaleString()} XP to ${rank.nextTier?.name}`}
              </p>

              <div className="profile-rank-ladder">
                {RANK_TIERS.map((tier, index) => {
                  const isCurrent = tier.id === rank.tier.id;
                  const isPassed = index < rank.tierIndex;
                  return (
                    <div
                      key={tier.id}
                      className={`profile-rank-ladder-row ${isCurrent ? 'current' : ''} ${isPassed ? 'passed' : ''}`}
                      style={{ '--rank-color': tier.color, '--rank-tint': tier.tint } as React.CSSProperties}
                    >
                      <RankBadge
                        tierId={tier.id}
                        size={48}
                        className={`profile-rank-ladder-badge-img ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''}`}
                      />
                      <div className="profile-rank-ladder-info">
                        <span className="profile-rank-ladder-name">
                          {index + 1}. {tier.name}
                          {isCurrent && <span className="profile-rank-you-tag">YOU</span>}
                        </span>
                        <span className="profile-rank-ladder-tagline">
                          {tier.basis} · {tier.vibe}
                        </span>
                      </div>
                      <span className="profile-rank-ladder-xp">
                        {tier.minXp.toLocaleString()}+ XP
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Membership Modal */}
      {isOwnProfile && (
        <MembershipModal isOpen={isMembershipOpen} onClose={() => setIsMembershipOpen(false)} />
      )}
    </div>
  );
};

export default ProfileView;
