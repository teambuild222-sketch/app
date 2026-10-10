import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Navbar, TabType, MapEventScope } from './Navbar';
import { useTheme } from '../themeContext';
import ProfileView from './profile/ProfileView';
import { ME_AUTHOR_ID } from './profile/profileData';
import PlayerCard from './PlayerCard/PlayerCard';
import {
  Compass,
  Home,
  Search,
  MessageSquare,
  User as UserIcon,
  Settings,
  Lock,
  HelpCircle,
  Info,
  LogOut,
  Bell,
  Menu,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { MembershipModal, getSavedPlan, PLAN_CHANGE_EVENT, PlanType } from './Membership/Membership';
import ExplorePage from './ExplorePage/ExplorePage';
import HomePostCard from './HomeFeed/HomePostCard';
import { HOME_FEED_POSTS, type HomeFeedPost, type HomeMainCategory } from './HomeFeed/homeFeed';
import { buildFeed, FEED_CHANGED_EVENT } from './HomeFeed/feedAlgorithm';
import { getInitialFeedPosts, loadFeedPosts } from './HomeFeed/feedSource';
import { isBackendEnabled } from '../api/client';
import { initialAvatar } from '../lib/avatar';
import { useNotifications } from '../lib/useNotifications';
import { NotificationsList } from './NotificationsList';
import type { NotificationDto } from '../api/types';
import { refreshStats } from '../api/statsApi';
import { useLiveSync } from '../lib/useLiveSync';
import { CreateEventModal } from './ExplorePage/CreateEventModal';
import DiscoverPage from './DiscoverFeed/DiscoverPage';
import ChatPage from './Chat/ChatPage';
import {
  loadUserPosts,
  submitCreateEvent,
  USER_POSTS_CHANGED_EVENT,
  type CreateEventPayload,
} from './HomeFeed/publishContent';
import { logout } from '../api';
import './Layout.css';

export const Layout: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [mapEventScope, setMapEventScope] = useState<MapEventScope>(() => {
    try {
      return localStorage.getItem('simsor-map-event-scope') === 'private' ? 'private' : 'public';
    } catch {
      return 'public';
    }
  });
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [exploreFocus, setExploreFocus] = useState<{
    eventId: string;
    coordinates: [number, number];
    mainCategory?: HomeMainCategory;
  } | null>(null);
  const navigate = useNavigate();

  // Membership states
  const [membershipPlan, setMembershipPlan] = useState<PlanType>(getSavedPlan);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const live = isBackendEnabled();
  const readFullName = () =>
    localStorage.getItem('simsor-fullname') ||
    (live ? localStorage.getItem('simsor-username') || '' : 'Katakam Ritvik');
  const readAvatar = () =>
    localStorage.getItem('simsor-avatar') ||
    (live
      ? initialAvatar(readFullName())
      : 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');
  const [fullName, setFullName] = useState(readFullName);
  const [avatar, setAvatar] = useState(readAvatar);

  useEffect(() => {
    // Demo defaults exist only for the offline mock mode. With a live backend the
    // identity always comes from the signed-in account.
    if (live) return;
    if (!localStorage.getItem('simsor-fullname')) {
      localStorage.setItem('simsor-fullname', 'Katakam Ritvik');
    }
    if (!localStorage.getItem('simsor-avatar')) {
      localStorage.setItem('simsor-avatar', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');
    }
  }, [live]);

  useEffect(() => {
    const handlePlanChange = () => {
      setMembershipPlan(getSavedPlan());
    };
    const handleProfileChange = () => {
      setFullName(readFullName());
      setAvatar(readAvatar());
    };
    
    window.addEventListener(PLAN_CHANGE_EVENT, handlePlanChange);
    window.addEventListener('storage', handleProfileChange);
    
    const interval = setInterval(handleProfileChange, 500);

    return () => {
      window.removeEventListener(PLAN_CHANGE_EVENT, handlePlanChange);
      window.removeEventListener('storage', handleProfileChange);
      clearInterval(interval);
    };
  }, []);

  const handleViewOrganizerProfile = (organizerId: string) => {
    setViewingProfileId(organizerId === ME_AUTHOR_ID ? null : organizerId);
    setActiveTab('profile');
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === 'profile') setViewingProfileId(null);
    setActiveTab(tab);
  };

  const handleViewPostLocation = (post: HomeFeedPost) => {
    // Carry the category through — Explore only renders pins for the active
    // tab, so without it a Sports-tab map silently drops an Entertainment pin.
    setExploreFocus({
      eventId: post.eventId,
      coordinates: post.coordinates,
      mainCategory: post.mainCategory,
    });
    setActiveTab('explore');
  };

  // Feed recomputes when follows change, a post is created, or Home re-opens
  // (so newly-learned dwell/interest affinity is applied between visits).
  const [feedVersion, setFeedVersion] = useState(0);
  const [isHomeCreateOpen, setIsHomeCreateOpen] = useState(false);
  const [chatCreateGroupOpen, setChatCreateGroupOpen] = useState(false);
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const bumpFeed = () => setFeedVersion((v) => v + 1);
  const notifications = useNotifications();
  const closeNotifications = () => {
    setIsNotificationsOpen(false);
    void notifications.markAllRead();
  };
  const openNotification = (n: NotificationDto) => {
    const userId = n.data?.userId;
    setIsNotificationsOpen(false);
    void notifications.markAllRead();
    if (n.data?.type === 'like' || n.data?.type === 'comment') {
      setActiveTab('home');
    } else if (userId) {
      handleViewOrganizerProfile(userId);
    }
  };
  useLiveSync(() => {
    if (activeTab === 'home') bumpFeed();
    void refreshStats();
  });

  useEffect(() => {
    const onFeedChanged = () => bumpFeed();
    window.addEventListener(FEED_CHANGED_EVENT, onFeedChanged);
    window.addEventListener(USER_POSTS_CHANGED_EVENT, onFeedChanged);
    return () => {
      window.removeEventListener(FEED_CHANGED_EVENT, onFeedChanged);
      window.removeEventListener(USER_POSTS_CHANGED_EVENT, onFeedChanged);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'home') bumpFeed();
    if (activeTab !== 'chat') setChatCreateGroupOpen(false);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('simsor-map-event-scope', mapEventScope);
  }, [mapEventScope]);

  // Posts themselves come from `feedSource.ts` (real /api/posts once a backend
  // is configured, else the same localStorage + seed array as before) — kept
  // as state since that load is async, while `buildFeed`'s scoring stays
  // synchronous. Re-fetched whenever `feedVersion` bumps (new post, follow
  // change, tab re-open) so Home reflects the latest shared data.
  const [feedPosts, setFeedPosts] = useState<HomeFeedPost[]>(() => getInitialFeedPosts());

  useEffect(() => {
    let cancelled = false;
    loadFeedPosts()
      .then((posts) => {
        if (cancelled) return;
        // Keep the same array when nothing changed so background refreshes
        // don't reshuffle or re-render the feed under the user's thumb.
        setFeedPosts((prev) => (JSON.stringify(prev) === JSON.stringify(posts) ? prev : posts));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feedVersion]);

  const feed = useMemo(() => buildFeed(feedPosts), [feedPosts]);

  const handleHomeCreateEvent = async (eventData: Record<string, unknown>) => {
    try {
      const created = await submitCreateEvent(eventData as unknown as CreateEventPayload);
      bumpFeed();
      // Queue the map focus so the new pin is already selected whenever the
      // user switches to Explore, without yanking them off Home right now.
      setExploreFocus({
        eventId: created.id,
        coordinates: created.coordinates,
        mainCategory: created.mainCategory,
      });
      toast.success('Event created & posted to Home!');
    } catch {
      toast.error('Could not create the event. Please try again.');
    }
  };

  // Handle resizing to collapse sidebar on tablet view initially
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth <= 1024) {
        setIsSidebarOpen(false); // Collapsed on tablet screen space
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    setIsSettingsOpen(false);
    void logout().then(() => navigate('/login'));
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  // Mock RSVP Handler
  const handleRSVP = (eventName: string) => {
    alert(`Successfully RSVP'd to: ${eventName}! Added to your events list.`);
  };

  return (
    <div
      className={`simsor-app-shell ${activeTab === 'explore' ? 'explore-active' : ''} ${
        activeTab === 'chat' ? 'chat-active' : ''
      } ${
        activeTab === 'home' || activeTab === 'discover' || activeTab === 'chat' || activeTab === 'profile'
          ? 'home-active'
          : ''
      }`}
    >
      {/* Fixed Header — hidden on Profile and Explore */}
      {activeTab !== 'explore' && activeTab !== 'profile' && (
        <header className="simsor-header">
          <div className="simsor-header-start" aria-hidden="true" />

          <div className="simsor-header-center">
            <p
              className="simsor-app-title"
              onClick={() => handleTabChange('home')}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleTabChange('home');
              }}
            >
              SIMSOR
            </p>
          </div>

          <div className="simsor-header-actions">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={handleSidebarToggle}
              aria-label="Toggle sidebar"
            >
              {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
            </button>

            {activeTab === 'chat' ? (
              <button
                type="button"
                className="header-action-circle-btn chat-create-group-btn"
                onClick={() => setChatCreateGroupOpen(true)}
                aria-label="Create group chat"
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="header-action-circle-btn notifications-bell-btn"
                  onClick={() => setIsNotificationsOpen(true)}
                  aria-label="Notifications"
                >
                  <Bell size={19} />
                  {(live ? notifications.unread : 3) > 0 && (
                    <span className="red-badge-dot">{live ? (notifications.unread > 9 ? "9+" : notifications.unread) : 3}</span>
                  )}
                </button>

                <div className="settings-menu-container">
                  <button
                    className={`settings-trigger ${isSettingsOpen ? 'active' : ''}`}
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    aria-label="Settings"
                  >
                    <Settings size={19} />
                  </button>
                  {isSettingsOpen && (
                    <>
                      <div className="settings-backdrop" onClick={() => setIsSettingsOpen(false)} />
                      <div className="settings-dropdown animate-scaleIn">
                        <div
                          className={`settings-premium-bar plan-${membershipPlan.toLowerCase()}`}
                          onClick={() => { setIsSettingsOpen(false); setIsMembershipOpen(true); }}
                        >
                          <Sparkles size={14} className="premium-bar-icon" />
                          <div className="premium-bar-content">
                            <span className="premium-bar-title">
                              {membershipPlan === 'FREE' ? 'Simsor Gold / Silver' : `Simsor ${membershipPlan}`}
                            </span>
                            <span className="premium-bar-subtitle">
                              {membershipPlan === 'FREE' ? 'Upgrade to Premium' : 'Manage Subscription'}
                            </span>
                          </div>
                          <ChevronRight size={12} className="premium-bar-arrow" />
                        </div>

                        <button className="settings-option" onClick={() => { setIsSettingsOpen(false); handleTabChange('profile'); }}>
                          <UserIcon size={16} />
                          <span>Edit Profile</span>
                        </button>
                        <button
                          className="settings-option settings-option--toggle"
                          onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                        >
                          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                          <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
                          <span className={`settings-toggle-pill ${theme === 'dark' ? 'is-on' : ''}`} aria-hidden="true">
                            <span className="settings-toggle-knob" />
                          </span>
                        </button>
                        <button className="settings-option" onClick={() => { setIsSettingsOpen(false); alert('Settings clicked'); }}>
                          <Settings size={16} />
                          <span>Settings</span>
                        </button>
                        <button className="settings-option" onClick={() => { setIsSettingsOpen(false); alert('Privacy clicked'); }}>
                          <Lock size={16} />
                          <span>Privacy</span>
                        </button>
                        <button className="settings-option" onClick={() => { setIsSettingsOpen(false); alert('Help & Support clicked'); }}>
                          <HelpCircle size={16} />
                          <span>Help & Support</span>
                        </button>
                        <button className="settings-option" onClick={() => { setIsSettingsOpen(false); alert('About Simsor clicked'); }}>
                          <Info size={16} />
                          <span>About Simsor</span>
                        </button>
                        <div className="settings-dropdown-divider" />
                        <button className="settings-option logout-option" onClick={handleLogout}>
                          <LogOut size={16} />
                          <span>Logout</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* Main Responsive Grid Layout */}
      <div className={`simsor-layout-grid ${activeTab === 'explore' ? 'explore-layout-grid' : ''} ${isSidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        
        {/* Left Sidebar */}
        <aside className={`simsor-sidebar ${activeTab === 'explore' ? 'explore-sidebar-floating' : ''} ${isSidebarOpen ? 'expanded' : 'collapsed'}`}>
          <div className="simsor-sidebar-inner">
            {/* Sidebar Branding (Only on Desktop when expanded) */}
            <div className="simsor-sidebar-brand">
              <img src="/logo.png" alt="SIMSOR" className="simsor-sidebar-logo-img" />
              <span className="simsor-sidebar-logo-text">SIMSOR</span>
            </div>

            <div className="simsor-sidebar-title">
              <span>MENU</span>
            </div>

            <nav className="simsor-nav-links">
              <button
                className={`sidebar-nav-item ${activeTab === 'explore' ? 'active' : ''}`}
                onClick={() => setActiveTab('explore')}
                aria-label="Explore"
              >
                <Compass size={18} />
                <span>Explore</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => setActiveTab('home')}
                aria-label="Home"
              >
                <Home size={18} />
                <span>Home</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeTab === 'discover' ? 'active' : ''}`}
                onClick={() => setActiveTab('discover')}
                aria-label="Discover"
              >
                <Search size={18} />
                <span>Discover</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
                aria-label="Chat"
              >
                <MessageSquare size={18} />
                <span>Chat</span>
              </button>

              <button
                className={`sidebar-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
                aria-label="Profile"
              >
                <UserIcon size={18} />
                <span>Profile</span>
              </button>
            </nav>

            <div className="simsor-sidebar-divider" />

            <div className="simsor-sidebar-utilities">
              <button
                className="sidebar-nav-item"
                onClick={() => setIsNotificationsOpen(true)}
                aria-label="Notifications"
              >
                <Bell size={18} />
                <span>Notifications</span>
              </button>

              <button
                className="sidebar-nav-item"
                onClick={() => setActiveTab('profile')}
                aria-label="Settings"
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>

              <button className="sidebar-nav-item logout-button" onClick={handleLogout}>
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Panel Viewport */}
        <main className="simsor-main-panel">
          
          {/* EXPLORE PAGE */}
          {activeTab === 'explore' && (
            <ExplorePage
              onViewOrganizerProfile={handleViewOrganizerProfile}
              focusTarget={exploreFocus}
              onFocusHandled={() => setExploreFocus(null)}
              mapEventScope={mapEventScope}
            />
          )}

          {/* HOME PAGE – Instagram-style ranked event feed */}
          {activeTab === 'home' && (
            <div className="home-feed-view home-feed-view--posts animate-fadeIn">
              <button
                type="button"
                className="home-create-fab"
                onClick={() => setIsHomeCreateOpen(true)}
                aria-label="Create post or event"
              >
                <Plus size={22} strokeWidth={2.5} />
              </button>
              <CreateEventModal
                isOpen={isHomeCreateOpen}
                onClose={() => setIsHomeCreateOpen(false)}
                onSubmit={handleHomeCreateEvent}
              />
              {feed.hasFollowing && (
                <section className="home-feed-block">
                  <div className="home-feed-section-label">Boosting</div>
                  <div className="home-feed-list">
                    {feed.following.map((post) => (
                      <HomePostCard
                        key={post.id}
                        post={post}
                        onViewHostProfile={handleViewOrganizerProfile}
                        onViewAuthorProfile={handleViewOrganizerProfile}
                        onViewLocation={handleViewPostLocation}
                        onFollowChange={bumpFeed}
                        onPostDeleted={bumpFeed}
                      />
                    ))}
                  </div>
                </section>
              )}

              {feed.suggested.length > 0 && (
                <section className="home-feed-block">
                  <div className="home-feed-section-label">
                    {feed.hasFollowing ? 'Suggested for you' : 'For you'}
                  </div>
                  <div className="home-feed-list">
                    {feed.suggested.map(({ post, reason }) => (
                      <HomePostCard
                        key={post.id}
                        post={post}
                        reason={reason}
                        onViewHostProfile={handleViewOrganizerProfile}
                        onViewAuthorProfile={handleViewOrganizerProfile}
                        onViewLocation={handleViewPostLocation}
                        onFollowChange={bumpFeed}
                        onPostDeleted={bumpFeed}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* DISCOVER FEED */}
          {activeTab === 'discover' && (
            <DiscoverPage
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              onViewOrganizerProfile={handleViewOrganizerProfile}
              onViewPostLocation={handleViewPostLocation}
              feedVersion={feedVersion}
              onFollowChange={bumpFeed}
            />
          )}

          {/* CHAT PAGE */}
          {activeTab === 'chat' && (
            <div className="chat-page-view animate-fadeIn">
              <ChatPage
                feedPosts={feed}
                createGroupOpen={chatCreateGroupOpen}
                onCreateGroupOpenChange={setChatCreateGroupOpen}
                initialChatId={pendingChatId}
                onInitialChatConsumed={() => setPendingChatId(null)}
              />
            </div>
          )}

          {/* PROFILE PAGE */}
          {activeTab === 'profile' && (
            <div className="profile-page-view animate-fadeIn">
              <ProfileView
                userId={viewingProfileId}
                onViewProfile={handleViewOrganizerProfile}
                onBack={() => setViewingProfileId(null)}
                onOpenChat={(chatId) => {
                  setPendingChatId(chatId);
                  setActiveTab('chat');
                }}
              />
            </div>
          )}

        </main>

        {/* Right Panel (Visible on Desktop >1024px) */}
        <aside className="simsor-right-panel">
          
          {/* Membership Desktop Card */}
          <div className="glass-card right-panel-card membership-desktop-card">
            <div className="desktop-card-profile">
              <img src={avatar} alt={fullName} className="desktop-card-avatar" />
              <div className="desktop-card-info">
                <span className="desktop-card-name">{fullName}</span>
                <div className="desktop-card-plan-row">
                  <span className="desktop-card-plan-label">Current Plan:</span>
                  <span className={`plan-badge-pill badge-${membershipPlan.toLowerCase()}`}>{membershipPlan}</span>
                </div>
              </div>
            </div>

            {membershipPlan === 'FREE' && (
              <div className="desktop-quick-upgrades">
                <div className="quick-upgrade-item">
                  <span>Upgrade to <strong>PLUS</strong></span>
                  <span>₹699/mo</span>
                </div>
                <div className="quick-upgrade-item">
                  <span>Upgrade to <strong>PRO</strong></span>
                  <span>₹999/mo</span>
                </div>
              </div>
            )}

            {membershipPlan === 'PLUS' && (
              <div className="desktop-quick-upgrades">
                <div className="quick-upgrade-item">
                  <span>Upgrade to <strong>PRO</strong></span>
                  <span>₹999/mo</span>
                </div>
              </div>
            )}

            <button 
              type="button" 
              className="desktop-upgrade-now-btn"
              onClick={() => setIsMembershipOpen(true)}
            >
              <Sparkles size={14} />
              <span>{membershipPlan === 'PRO' ? 'Manage Plan' : 'Upgrade Now'}</span>
            </button>
          </div>

          {/* Notifications Card */}
          <div className="glass-card right-panel-card">
            <div className="panel-heading">
              <h3>Notifications</h3>
              <span className="unread-badge">{live ? `${notifications.unread} unread` : "3 unread"}</span>
            </div>
            {live ? (
              <NotificationsList items={notifications.items.slice(0, 8)} onOpen={openNotification} />
            ) : (
              <div className="panel-notifications-list">
              <div className="panel-notif-item unread">
                <div className="panel-notif-dot" />
                <div className="panel-notif-info">
                  <span className="panel-notif-text"><strong>Rahul Sharma</strong> wants to Dab Up with you.</span>
                  <span className="panel-notif-time">2h ago</span>
                </div>
              </div>
              <div className="panel-notif-item">
                <div className="panel-notif-info">
                  <span className="panel-notif-text">Cricket Match near <strong>Madhapur</strong> starts tomorrow.</span>
                  <span className="panel-notif-time">1d ago</span>
                </div>
              </div>
              <div className="panel-notif-item">
                <div className="panel-notif-info">
                  <span className="panel-notif-text">Your badge <strong>Event Organizer</strong> has been unlocked!</span>
                  <span className="panel-notif-time">3d ago</span>
                </div>
              </div>
            </div>
            )}
          </div>

          {!live && (
          <>
          {/* Suggested Dab Ups */}
          <div className="glass-card right-panel-card">
            <div className="panel-heading">
              <h3>Suggested Dab Ups</h3>
              <span>3 new</span>
            </div>
            <ul className="panel-list">
              <li>
                <div className="panel-item-left">
                  <strong>Rahul Sharma</strong>
                  <span>Cricket Captain</span>
                </div>
                <button className="panel-item-action-btn">Dab Up</button>
              </li>
              <li>
                <div className="panel-item-left">
                  <strong>Neha Reddy</strong>
                  <span>Event Host</span>
                </div>
                <button className="panel-item-action-btn">Dab Up</button>
              </li>
              <li>
                <div className="panel-item-left">
                  <strong>Aisha Khan</strong>
                  <span>Fitness Trainer</span>
                </div>
                <button className="panel-item-action-btn">Dab Up</button>
              </li>
            </ul>
          </div>

          {/* Trending Events */}
          <div className="glass-card right-panel-card">
            <div className="panel-heading">
              <h3>Trending Events</h3>
              <span>Today</span>
            </div>
            <ul className="panel-list">
              <li>
                <div className="panel-item-left">
                  <strong>Sunday Football</strong>
                  <span>5 spots left</span>
                </div>
                <button className="panel-item-action-btn action-rsvp" onClick={() => handleRSVP("Sunday Football")}>RSVP</button>
              </li>
              <li>
                <div className="panel-item-left">
                  <strong>Live DJ Night</strong>
                  <span>Madhapur</span>
                </div>
                <button className="panel-item-action-btn action-rsvp" onClick={() => handleRSVP("Live DJ Night")}>RSVP</button>
              </li>
              <li>
                <div className="panel-item-left">
                  <strong>Open Mic</strong>
                  <span>Free entry</span>
                </div>
                <button className="panel-item-action-btn action-rsvp" onClick={() => handleRSVP("Open Mic")}>RSVP</button>
              </li>
            </ul>
          </div>

          {/* Rewards Summary */}
          <div className="glass-card right-panel-card rewards-card">
            <div className="panel-heading">
              <h3>Rewards Summary</h3>
              <span className="rewards-badge">XP Level 8</span>
            </div>
            <p><strong>12 Badges Earned</strong></p>
            <p className="rewards-sub">2 challenges unlocked in Hyderabad.</p>
            <div className="progress-bar" style={{ marginTop: 12 }}>
              <div className="progress-bar-fill" style={{ width: '65%' }}></div>
            </div>
            <div className="progress-bar-labels">
              <span>850 XP</span>
              <span>1200 XP to Level 9</span>
            </div>
          </div>

          {/* Online Users */}
          <div className="glass-card right-panel-card online-users-card">
            <div className="panel-heading">
              <h3>Online Users</h3>
              <span className="online-users-count">3 Online</span>
            </div>
            <div className="panel-online-users-list">
              <div className="online-user-item">
                <div className="online-avatar-wrap">
                  <img src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&h=150&q=80" alt="Rahul Sharma" className="online-avatar" />
                  <span className="online-dot-indicator" />
                </div>
                <span className="online-name">Rahul Sharma</span>
              </div>
              <div className="online-user-item">
                <div className="online-avatar-wrap">
                  <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80" alt="Neha Reddy" className="online-avatar" />
                  <span className="online-dot-indicator" />
                </div>
                <span className="online-name">Neha Reddy</span>
              </div>
              <div className="online-user-item">
                <div className="online-avatar-wrap">
                  <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80" alt="Vikram Malhotra" className="online-avatar" />
                  <span className="online-dot-indicator" />
                </div>
                <span className="online-name">Vikram Malhotra</span>
              </div>
            </div>
          </div>
          </>
          )}

        </aside>
      </div>

      {/* Slide-up Notifications Drawer (Used on mobile/tablet) */}
      {isNotificationsOpen && (
        <div className="ios-drawer-overlay" onClick={closeNotifications}>
          <div className="ios-drawer-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={closeNotifications} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body">
              <h3 className="ios-drawer-title">Notifications</h3>
              <p className="ios-drawer-subtitle">{live ? "Live updates from your people" : "Stay connected with your matches"}</p>

              {live ? (
                <NotificationsList items={notifications.items} onOpen={openNotification} />
              ) : (
                <div className="panel-notifications-list">
                <div className="panel-notif-item unread">
                  <div className="panel-notif-dot" />
                  <div className="panel-notif-info">
                    <span className="panel-notif-text"><strong>Rahul Sharma</strong> wants to Dab Up with you.</span>
                    <span className="panel-notif-time">2h ago</span>
                  </div>
                </div>
                <div className="panel-notif-item">
                  <div className="panel-notif-info">
                    <span className="panel-notif-text">Cricket Match near <strong>Madhapur</strong> starts tomorrow.</span>
                    <span className="panel-notif-time">1d ago</span>
                  </div>
                </div>
                <div className="panel-notif-item">
                  <div className="panel-notif-info">
                    <span className="panel-notif-text">Your badge <strong>Event Organizer</strong> has been unlocked!</span>
                    <span className="panel-notif-time">3d ago</span>
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar (Visible on Mobile <768px) */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        mapEventScope={mapEventScope}
        onMapEventScopeChange={setMapEventScope}
      />

      {/* Premium Membership Modal */}
      <MembershipModal isOpen={isMembershipOpen} onClose={() => setIsMembershipOpen(false)} />
    </div>
  );
};

export default Layout;
