import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, TabType } from './Navbar';
import { ThemeSwitch } from './ThemeSwitch';
import ProfileView from './profile/ProfileView';
import EventCard from './EventCard/EventCard';
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
  X,
  Plus,
  Send,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { MembershipModal, getSavedPlan, PLAN_CHANGE_EVENT, PlanType } from './Membership/Membership';
import './Layout.css';

interface Message {
  id: number;
  sender: 'me' | 'other';
  text: string;
  time: string;
}

interface ChatSession {
  id: number;
  name: string;
  avatar: string;
  role: string;
  online: boolean;
  messages: Message[];
}

export const Layout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Membership states
  const [membershipPlan, setMembershipPlan] = useState<PlanType>(getSavedPlan);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [fullName, setFullName] = useState(() => localStorage.getItem('zenex-fullname') || 'Katakam Ritvik');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('zenex-avatar') || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');

  useEffect(() => {
    // If not set yet, store default Katakam Ritvik so it matches screenshot
    if (!localStorage.getItem('zenex-fullname')) {
      localStorage.setItem('zenex-fullname', 'Katakam Ritvik');
    }
    if (!localStorage.getItem('zenex-avatar')) {
      localStorage.setItem('zenex-avatar', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');
    }
  }, []);

  useEffect(() => {
    const handlePlanChange = () => {
      setMembershipPlan(getSavedPlan());
    };
    const handleProfileChange = () => {
      setFullName(localStorage.getItem('zenex-fullname') || 'Katakam Ritvik');
      setAvatar(localStorage.getItem('zenex-avatar') || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80');
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

  // Chat interactive states
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    {
      id: 1,
      name: 'Rahul Sharma',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&h=150&q=80',
      role: 'Cricket Captain',
      online: true,
      messages: [
        { id: 1, sender: 'other', text: 'Hey, are you down for the cricket match this Sunday?', time: '2:15 PM' },
        { id: 2, sender: 'me', text: 'Yeah, definitely! What time does it start?', time: '2:18 PM' },
        { id: 3, sender: 'other', text: 'We start at 9 AM in Gachibowli. See you there!', time: '2:20 PM' },
      ],
    },
    {
      id: 2,
      name: 'Neha Reddy',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
      role: 'Event Host',
      online: true,
      messages: [
        { id: 1, sender: 'other', text: 'Hi! Thanks for attending the open mic night!', time: 'Yesterday' },
        { id: 2, sender: 'me', text: 'It was amazing! The performances were great.', time: 'Yesterday' },
      ],
    },
    {
      id: 3,
      name: 'Aisha Khan',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80',
      role: 'Fitness Trainer',
      online: false,
      messages: [
        { id: 1, sender: 'other', text: 'Group yoga session is scheduled for Saturday morning.', time: '2 days ago' },
      ],
    },
  ]);
  const [activeChatId, setActiveChatId] = useState<number>(1);
  const [typedMessage, setTypedMessage] = useState('');

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
    localStorage.removeItem('zenex-auth');
    navigate('/login');
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleSendMessage = () => {
    if (!typedMessage.trim()) return;

    setChatSessions((prev) =>
      prev.map((chat) => {
        if (chat.id === activeChatId) {
          const now = new Date();
          const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return {
            ...chat,
            messages: [
              ...chat.messages,
              {
                id: chat.messages.length + 1,
                sender: 'me',
                text: typedMessage,
                time: timeString,
              },
            ],
          };
        }
        return chat;
      })
    );
    setTypedMessage('');
  };

  // Mock RSVP Handler
  const handleRSVP = (eventName: string) => {
    alert(`Successfully RSVP'd to: ${eventName}! Added to your events list.`);
  };

  // Get active chat
  const activeChat = chatSessions.find((c) => c.id === activeChatId) || chatSessions[0];

  return (
    <div className="zenex-app-shell">
      {/* Fixed Header */}
      <header className="zenex-header">
        <div className="zenex-brand-group">
          {/* Logo element clickable to reset to home */}
          <div className="zenex-logo-pill" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>
            <img src="/logo.png" alt="ZENEX" className="header-logo-img" />
          </div>
          <div>
            <p className="zenex-app-title" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>ZENEX</p>
            <p className="zenex-app-tagline">Connect. Play. Experience.</p>
          </div>
        </div>

        <div className="zenex-header-actions">
          {/* Collapsible Sidebar Button (visible on tablet and desktop) */}
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={handleSidebarToggle}
            aria-label="Toggle sidebar"
          >
            {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
          
          <ThemeSwitch />

          {/* Quick Notification Bell */}
          <button
            type="button"
            className="header-action-circle-btn notifications-bell-btn"
            onClick={() => setIsNotificationsOpen(true)}
            aria-label="Notifications"
          >
            <Bell size={20} />
            <span className="red-badge-dot">3</span>
          </button>

          {/* Settings Trigger */}
          <div className="settings-menu-container">
            <button
              className={`settings-trigger ${isSettingsOpen ? 'active' : ''}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              aria-label="Settings"
            >
              <Settings size={20} />
            </button>
            {isSettingsOpen && (
              <>
                <div className="settings-backdrop" onClick={() => setIsSettingsOpen(false)} />
                <div className="settings-dropdown animate-scaleIn">
                  {/* Premium subscription bar */}
                  <div 
                    className={`settings-premium-bar plan-${membershipPlan.toLowerCase()}`} 
                    onClick={() => { setIsSettingsOpen(false); setIsMembershipOpen(true); }}
                  >
                    <Sparkles size={14} className="premium-bar-icon" />
                    <div className="premium-bar-content">
                      <span className="premium-bar-title">
                        {membershipPlan === 'FREE' ? 'Zenex Gold / Silver' : `Zenex ${membershipPlan}`}
                      </span>
                      <span className="premium-bar-subtitle">
                        {membershipPlan === 'FREE' ? 'Upgrade to Premium' : 'Manage Subscription'}
                      </span>
                    </div>
                    <ChevronRight size={12} className="premium-bar-arrow" />
                  </div>

                  <button className="settings-option" onClick={() => { setIsSettingsOpen(false); setActiveTab('profile'); }}>
                    <UserIcon size={16} />
                    <span>Edit Profile</span>
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
                  <button className="settings-option" onClick={() => { setIsSettingsOpen(false); alert('About Zenex clicked'); }}>
                    <Info size={16} />
                    <span>About Zenex</span>
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
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <div className={`zenex-layout-grid ${isSidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        
        {/* Left Sidebar */}
        <aside className={`zenex-sidebar ${isSidebarOpen ? 'expanded' : 'collapsed'}`}>
          <div className="zenex-sidebar-inner">
            {/* Sidebar Branding (Only on Desktop when expanded) */}
            <div className="zenex-sidebar-brand">
              <img src="/logo.png" alt="ZENEX" className="zenex-sidebar-logo-img" />
              <span className="zenex-sidebar-logo-text">ZENEX</span>
            </div>

            <div className="zenex-sidebar-title">
              <span>MENU</span>
            </div>

            <nav className="zenex-nav-links">
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

            <div className="zenex-sidebar-divider" />

            <div className="zenex-sidebar-utilities">
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
                onClick={() => setIsSettingsOpen(true)}
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
        <main className="zenex-main-panel">
          
          {/* EXPLORE PAGE */}
          {activeTab === 'explore' && (
            <div className="explore-page-view animate-fadeIn">
              <section className="zenex-hero-card glass-card">
                <div className="hero-card-copy">
                  <span className="hero-chip">Interactive Map & Players</span>
                  <h2>Explore Page</h2>
                  <p>Discover matches, sports complexes, and connect with players near you on our real-time radar.</p>
                </div>
                <div className="hero-card-icon">
                  <Compass size={36} />
                </div>
              </section>

              {/* Map Section Mockup */}
              <section className="explore-map-container glass-card">
                <div className="map-view-header">
                  <span className="map-title">📍 HYDERABAD RADAR</span>
                  <div className="map-filter-toggle">
                    <button className="map-filter-btn active">All Pins</button>
                    <button className="map-filter-btn">Players</button>
                    <button className="map-filter-btn">Events</button>
                  </div>
                </div>

                <div className="map-canvas-mock">
                  {/* Grid Lines */}
                  <div className="map-grid-lines" />
                  
                  {/* Decorative roads */}
                  <div className="map-road road-h" />
                  <div className="map-road road-v" />
                  <div className="map-road road-diagonal" />

                  {/* Pulsing center radar user */}
                  <div className="map-user-center">
                    <span className="center-dot-pulse" />
                    <span className="center-dot" />
                  </div>

                  {/* Map Pins */}
                  {/* Pin 1: Rahul Sharma */}
                  <div className="map-pin-wrapper" style={{ top: '30%', left: '25%' }} onClick={() => toast('Rahul Sharma: Cricket Captain (1.2 km away)')}>
                    <div className="map-pin player-pin">
                      <img src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=80&h=80&q=80" alt="Rahul" className="pin-avatar" />
                      <span className="pin-pulse" />
                    </div>
                    <span className="pin-tooltip">Rahul Sharma (Cricket)</span>
                  </div>

                  {/* Pin 2: Neha Reddy */}
                  <div className="map-pin-wrapper" style={{ top: '65%', left: '75%' }} onClick={() => toast('Neha Reddy: Tennis Event Host (2.5 km away)')}>
                    <div className="map-pin player-pin">
                      <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80" alt="Neha" className="pin-avatar" />
                      <span className="pin-pulse" />
                    </div>
                    <span className="pin-tooltip">Neha Reddy (Tennis)</span>
                  </div>

                  {/* Pin 3: Football Match Event */}
                  <div className="map-pin-wrapper" style={{ top: '25%', left: '60%' }} onClick={() => toast('Event: Sunday Football Match (Madhapur Turf, 1.2 km away)')}>
                    <div className="map-pin event-pin">
                      <span className="pin-emoji">⚽</span>
                      <span className="pin-pulse event-pulse" />
                    </div>
                    <span className="pin-tooltip highlight">Sunday Football Match</span>
                  </div>

                  {/* Pin 4: Aisha Khan */}
                  <div className="map-pin-wrapper" style={{ top: '80%', left: '40%' }} onClick={() => toast('Aisha Khan: Fitness Trainer (3.1 km away)')}>
                    <div className="map-pin player-pin">
                      <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&h=80&q=80" alt="Aisha" className="pin-avatar" />
                      <span className="pin-pulse" />
                    </div>
                    <span className="pin-tooltip">Aisha Khan (Yoga)</span>
                  </div>
                </div>
              </section>

              {/* Live Search & Filter Bar */}
              <div className="explore-search-container glass-card">
                <Search className="search-bar-icon" size={18} />
                <input
                  type="text"
                  placeholder="Search sports, venues or usernames in Hyderabad..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="explore-search-input"
                />
              </div>

              {/* Nearby Events Section */}
              <section className="explore-events-section">
                <div className="section-header-row">
                  <h3>Nearby Events</h3>
                  <p>Matches and tournaments in your immediate neighborhood</p>
                </div>
                <div className="events-grid-layout" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                  <EventCard
                    title="Sunday Football Match"
                    category="Football"
                    date="Sun, June 7"
                    time="5:00 PM"
                    location="Madhapur Turf, Hyderabad"
                    attendees={12}
                    image="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=400&h=250&q=80"
                    onRSVP={() => handleRSVP("Sunday Football Match")}
                    fullWidth
                  />
                  <EventCard
                    title="Cricket Premier Tournament"
                    category="Cricket"
                    date="Fri, June 12"
                    time="9:00 AM"
                    location="State Ground, Secunderabad"
                    attendees={22}
                    image="https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=400&h=250&q=80"
                    onRSVP={() => handleRSVP("Cricket Premier Tournament")}
                    fullWidth
                  />
                </div>
              </section>

              {/* Active Matchmaking Connections */}
              <section className="explore-connections-section">
                <div className="section-header-row">
                  <h3>Nearby Players</h3>
                  <p>Active players matching your interest tags</p>
                </div>
                <div className="players-grid-layout">
                  <PlayerCard
                    name="Rahul Sharma"
                    distance="1.2 km away"
                    sports={['Cricket', 'Football']}
                    skillLevel="Intermediate"
                    isOnline={true}
                    avatar="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&h=150&q=80"
                  />
                  <PlayerCard
                    name="Neha Reddy"
                    distance="2.5 km away"
                    sports={['Tennis', 'Badminton']}
                    skillLevel="Advanced"
                    isOnline={true}
                    avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80"
                  />
                  <PlayerCard
                    name="Aisha Khan"
                    distance="3.1 km away"
                    sports={['Yoga', 'Running']}
                    skillLevel="Pro"
                    isOnline={false}
                    avatar="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80"
                  />
                  <PlayerCard
                    name="Vikram Malhotra"
                    distance="5.0 km away"
                    sports={['Football', 'Basketball']}
                    skillLevel="Pro"
                    isOnline={true}
                    avatar="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80"
                  />
                </div>
              </section>
            </div>
          )}

          {/* HOME PAGE (EVENT FEED) */}
          {activeTab === 'home' && (
            <div className="home-feed-view animate-fadeIn">
              <section className="zenex-hero-card glass-card">
                <div className="hero-card-copy">
                  <span className="hero-chip">Featured Events</span>
                  <h2>Event Feed</h2>
                  <p>Welcome to ZENEX. Explore upcoming local cricket match tournaments and entertainment activities.</p>
                </div>
                <div className="hero-card-icon">
                  <div className="hero-icon-glow" />
                  <Home size={36} />
                </div>
              </section>

              {/* Statistics snapshot card */}
              <section className="zenex-dashboard-grid">
                <article className="glass-card info-card">
                  <h3>Activity Snapshot</h3>
                  <p>Check in for daily interactions, groups, and match highlights in Madhapur.</p>
                </article>
                <article className="glass-card info-card">
                  <h3>Weekly Goal Progress</h3>
                  <p>Attend 2 more matches to unlock the <strong>Community Builder</strong> Badge!</p>
                </article>
              </section>

              {/* Main feed list */}
              <section className="events-feed-list">
                <div className="section-header-row">
                  <h3>Happening in Hyderabad</h3>
                  <span>Updated 5m ago</span>
                </div>
                <div className="events-grid-layout">
                  <EventCard
                    title="Sunday Football Match"
                    category="Football"
                    date="Sun, June 7"
                    time="5:00 PM"
                    location="Madhapur Turf, Hyderabad"
                    attendees={12}
                    image="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=400&h=250&q=80"
                    onRSVP={() => handleRSVP("Sunday Football Match")}
                  />
                  <EventCard
                    title="Live DJ & Sundowner"
                    category="Entertainment"
                    date="Sat, June 20"
                    time="6:00 PM"
                    location="Over the Moon, Gachibowli"
                    attendees={112}
                    image="https://images.unsplash.com/photo-1516280440614-37939bbacd6a?auto=format&fit=crop&w=400&h=250&q=80"
                    onRSVP={() => handleRSVP("Live DJ & Sundowner")}
                  />
                  <EventCard
                    title="Cricket Premier Tournament"
                    category="Cricket"
                    date="Fri, June 12"
                    time="9:00 AM"
                    location="State Ground, Secunderabad"
                    attendees={22}
                    image="https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=400&h=250&q=80"
                    onRSVP={() => handleRSVP("Cricket Premier Tournament")}
                  />
                  <EventCard
                    title="Standup Open Mic"
                    category="Arts"
                    date="Wed, June 15"
                    time="7:30 PM"
                    location="The Habitat, Hyderabad"
                    attendees={45}
                    image="https://images.unsplash.com/photo-1516280440614-37939bbacd6a?auto=format&fit=crop&w=400&h=250&q=80"
                    onRSVP={() => handleRSVP("Standup Open Mic")}
                  />
                </div>
              </section>
            </div>
          )}

          {/* DISCOVER FEED */}
          {activeTab === 'discover' && (
            <div className="discover-page-view animate-fadeIn">
              <section className="zenex-hero-card glass-card">
                <div className="hero-card-copy">
                  <span className="hero-chip">Find & Match Activities</span>
                  <h2>Discover Feed</h2>
                  <p>Explore the full poster grid of sports, arts, music, wellness and competitive matches.</p>
                </div>
                <div className="hero-card-icon">
                  <div className="hero-icon-glow" />
                  <Search size={36} />
                </div>
              </section>

              {/* Interactive Category Tabs scroll */}
              <div className="discover-category-scroller">
                {['All', 'Sports', 'Entertainment', 'Arts', 'Fitness', 'Wellness'].map((cat) => (
                  <button
                    key={cat}
                    className={`discover-category-chip ${activeCategory === cat ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Grid of poster activity categories */}
              <section className="discover-grid-section">
                <h3>Explore Hubs</h3>
                <div className="discover-grid-layout">
                  <div className="discover-gradient-card card-purple-blue">
                    <h4>Sports Tournaments</h4>
                    <p>Find local tournaments, matches and leagues. Join team lineups or create customized challenges.</p>
                    <button className="discover-action-btn">Browse Matches</button>
                  </div>

                  <div className="discover-gradient-card card-purple-pink">
                    <h4>Performing Arts</h4>
                    <p>Immerse in local standup comedy showcases, music nights, poetry slams and indie acoustic sets.</p>
                    <button className="discover-action-btn">Find Stages</button>
                  </div>

                  <div className="discover-gradient-card card-blue-pink">
                    <h4>Wellness Sessions</h4>
                    <p>Connect with local fitness trainers, yoga sessions, runs, and healthy lifestyle clubs.</p>
                    <button className="discover-action-btn">Book Sessions</button>
                  </div>

                  <div className="discover-gradient-card card-orange-pink">
                    <h4>Community Hangouts</h4>
                    <p>Meet and connect with local organizers, esports matches, running groups and social communities.</p>
                    <button className="discover-action-btn">Meet People</button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* CHAT PAGE (INTERACTIVE PANEL) */}
          {activeTab === 'chat' && (
            <div className="chat-page-view animate-fadeIn">
              <div className="chat-layout-container glass-card">
                {/* Chat Left Panel */}
                <div className="chat-session-list">
                  <div className="chat-panel-header">
                    <h3>Conversations</h3>
                    <button className="new-chat-btn"><Plus size={16} /></button>
                  </div>
                  <div className="chat-session-scroll">
                    {chatSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`chat-session-item ${session.id === activeChatId ? 'active' : ''}`}
                        onClick={() => setActiveChatId(session.id)}
                      >
                        <div className="session-avatar-wrap">
                          <img src={session.avatar} alt={session.name} className="session-avatar" />
                          {session.online && <span className="session-online-dot" />}
                        </div>
                        <div className="session-details">
                          <div className="session-name-row">
                            <span className="session-name">{session.name}</span>
                            <span className="session-time">
                              {session.messages[session.messages.length - 1]?.time || ''}
                            </span>
                          </div>
                          <span className="session-message-preview">
                            {session.messages[session.messages.length - 1]?.text || 'No messages yet'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chat Right Panel (Conversation Box) */}
                <div className="chat-conversation-box">
                  <div className="conversation-header">
                    <div className="conversation-user-info">
                      <img src={activeChat.avatar} alt={activeChat.name} className="conversation-avatar" />
                      <div>
                        <span className="conversation-name">{activeChat.name}</span>
                        <span className="conversation-status">{activeChat.online ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="conversation-messages-list">
                    {activeChat.messages.map((msg) => (
                      <div key={msg.id} className={`chat-message-bubble ${msg.sender}`}>
                        <div className="message-content-box">
                          <p className="message-text">{msg.text}</p>
                          <span className="message-time">{msg.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="conversation-input-row">
                    <input
                      type="text"
                      placeholder={`Type a message to ${activeChat.name}...`}
                      value={typedMessage}
                      onChange={(e) => setTypedMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendMessage();
                      }}
                      className="chat-message-input"
                    />
                    <button
                      className="chat-send-btn"
                      onClick={handleSendMessage}
                      aria-label="Send message"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROFILE PAGE */}
          {activeTab === 'profile' && (
            <div className="profile-page-view animate-fadeIn">
              <ProfileView />
            </div>
          )}

        </main>

        {/* Right Panel (Visible on Desktop >1024px) */}
        <aside className="zenex-right-panel">
          
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
              <span className="unread-badge">3 unread</span>
            </div>
            <div className="panel-notifications-list">
              <div className="panel-notif-item unread">
                <div className="panel-notif-dot" />
                <div className="panel-notif-info">
                  <span className="panel-notif-text"><strong>Rahul Sharma</strong> sent you a connection request.</span>
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
          </div>

          {/* Suggested Connections */}
          <div className="glass-card right-panel-card">
            <div className="panel-heading">
              <h3>Suggested Connections</h3>
              <span>3 new</span>
            </div>
            <ul className="panel-list">
              <li>
                <div className="panel-item-left">
                  <strong>Rahul Sharma</strong>
                  <span>Cricket Captain</span>
                </div>
                <button className="panel-item-action-btn">Connect</button>
              </li>
              <li>
                <div className="panel-item-left">
                  <strong>Neha Reddy</strong>
                  <span>Event Host</span>
                </div>
                <button className="panel-item-action-btn">Connect</button>
              </li>
              <li>
                <div className="panel-item-left">
                  <strong>Aisha Khan</strong>
                  <span>Fitness Trainer</span>
                </div>
                <button className="panel-item-action-btn">Connect</button>
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

        </aside>
      </div>

      {/* Slide-up Notifications Drawer (Used on mobile/tablet) */}
      {isNotificationsOpen && (
        <div className="ios-drawer-overlay" onClick={() => setIsNotificationsOpen(false)}>
          <div className="ios-drawer-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <button className="ios-drawer-close-btn" onClick={() => setIsNotificationsOpen(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="ios-drawer-body">
              <h3 className="ios-drawer-title">Notifications</h3>
              <p className="ios-drawer-subtitle">Stay connected with your matches</p>

              <div className="panel-notifications-list">
                <div className="panel-notif-item unread">
                  <div className="panel-notif-dot" />
                  <div className="panel-notif-info">
                    <span className="panel-notif-text"><strong>Rahul Sharma</strong> sent you a connection request.</span>
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
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar (Visible on Mobile <768px) */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Premium Membership Modal */}
      <MembershipModal isOpen={isMembershipOpen} onClose={() => setIsMembershipOpen(false)} />
    </div>
  );
};

export default Layout;
