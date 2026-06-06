import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Bell, Compass, MapPin, Calendar, Clock, Settings, Sun, Moon, X, CheckCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { toast } from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import './ExplorePage.css';
import { useTheme } from '../../themeContext';

// Center of Hyderabad
const HYDERABAD_CENTER: [number, number] = [17.3969, 78.4692];

// Initial 5 Sample Events focused on Sports & Entertainment
const INITIAL_EVENTS = [
  {
    id: 'evt-cricket',
    title: 'Cricket Tournament',
    category: 'Cricket',
    mainCategory: 'Sports',
    date: 'Sun, June 14',
    time: '09:00 AM',
    venue: 'Miyapur Play Ground, Miyapur',
    location: 'Miyapur Play Ground, Miyapur',
    description: 'Join the premier amateur cricket league tournament in Hyderabad. Cash prizes and trophy for the winning squad!',
    coordinates: [17.4968, 78.3614] as [number, number],
    attendees: 56,
    image: 'https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'evt-openmic',
    title: 'Open Mic Night',
    category: 'Open Mic',
    mainCategory: 'Entertainment',
    date: 'Wed, June 17',
    time: '08:00 PM',
    venue: 'The Habitat Café, Jubilee Hills',
    location: 'The Habitat Café, Jubilee Hills',
    description: 'An open forum for local comedians, poets, and acoustic musicians. Stand up and express your creativity!',
    coordinates: [17.4312, 78.4065] as [number, number],
    attendees: 42,
    image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd6a?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'evt-foodfest',
    title: 'Food Festival',
    category: 'Food Events',
    mainCategory: 'Entertainment',
    date: 'Sun, June 28',
    time: '12:00 PM',
    venue: 'Gachibowli Arena, Gachibowli',
    location: 'Gachibowli Arena, Gachibowli',
    description: 'Savor street foods, desserts, and international delicacies from top vendors in Telangana.',
    coordinates: [17.4485, 78.3489] as [number, number],
    attendees: 580,
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'evt-concert',
    title: 'Music Concert',
    category: 'Music',
    mainCategory: 'Entertainment',
    date: 'Sat, June 20',
    time: '06:00 PM',
    venue: 'State Art Gallery, Hitech City',
    location: 'State Art Gallery, Hitech City',
    description: 'An evening of live electronic fusion music featuring top indie-electronic artists and beautiful light shows.',
    coordinates: [17.4435, 78.3772] as [number, number],
    attendees: 350,
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'evt-theatre',
    title: 'Theatre Show',
    category: 'Theatre',
    mainCategory: 'Entertainment',
    date: 'Thu, June 25',
    time: '07:30 PM',
    venue: 'Ravindra Bharathi, Banjara Hills',
    location: 'Ravindra Bharathi, Banjara Hills',
    description: 'Experience a captivating modern adaptation of classical drama, performed by seasoned local theatrical groups.',
    coordinates: [17.4156, 78.4347] as [number, number],
    attendees: 180,
    image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=600&q=80'
  }
];

// Helper component to pan/zoom map programmatically
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 1.0 });
  }, [center, zoom, map]);
  return null;
}

export const ExplorePage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // Load events
  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem('zenex-explore-events-v3');
    return saved ? JSON.parse(saved) : INITIAL_EVENTS;
  });

  // Toggles for iOS Floating Panels
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Create Event state removed from Explore page

  // Search filter and query state
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('zenex-recent-searches-v3');
    return saved ? JSON.parse(saved) : [];
  });

  // Map viewport panning controller
  const [mapCenter, setMapCenter] = useState<[number, number]>(HYDERABAD_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Settings mock toggles
  const [showRadiusBoundary, setShowRadiusBoundary] = useState(false);
  const [enableMapTraffic, setEnableMapTraffic] = useState(false);
  const [enableMapSatellite, setEnableMapSatellite] = useState(false);

  // Autofocus ref for search
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isSearchOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isSearchOpen]);

  // Escape Key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsNotificationsOpen(false);
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('zenex-explore-events-v3', JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem('zenex-recent-searches-v3', JSON.stringify(recentSearches));
  }, [recentSearches]);

  // Handle Search Submission
  const handleSearchSubmit = (term: string) => {
    setSearchQuery(term);
    if (term.trim()) {
      setRecentSearches(prev => {
        const filtered = prev.filter(item => item.toLowerCase() !== term.toLowerCase());
        return [term, ...filtered].slice(0, 5); // Keep top 5
      });
    }
    setIsSearchOpen(false); // Close search panel to view results on map
  };

  // Clear Recent Searches
  const clearRecentSearches = () => {
    setRecentSearches([]);
  };

  // Quick Filter tag clicks
  const handleQuickFilterClick = (filter: string) => {
    setSearchQuery(filter);
    
    // Add to recent searches
    setRecentSearches(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== filter.toLowerCase());
      return [filter, ...filtered].slice(0, 5);
    });
    
    setIsSearchOpen(false);
  };

  // Select Trending Event
  const handleSelectTrendingEvent = (event: any) => {
    setMapCenter(event.coordinates);
    setMapZoom(14);
    setSelectedEventId(event.id);
    setIsSearchOpen(false);
  };

  // Handle viewing event details from map popup
  const handleViewDetails = (event: any) => {
    setMapCenter(event.coordinates);
    setMapZoom(14);
    setSelectedEventId(event.id);
    toast.success(`Centered on ${event.title}`, {
      duration: 2500,
      icon: '📍',
      style: {
        background: theme === 'dark' ? '#111111' : '#FFFFFF',
        color: theme === 'dark' ? '#FFFFFF' : '#1D1D1F',
        border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #D2D2D7',
        borderRadius: '16px',
        padding: '12px 18px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
        fontSize: '14px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
      }
    });
  };

  // Create Event submission logic removed

  // Map marker category icon emojis
  const getCategoryEmoji = (category: string) => {
    switch (category) {
      case 'Cricket': return '🏏';
      case 'Badminton': return '🏸';
      case 'Open Mic': return '🎤';
      case 'Music': return '🎵';
      case 'Food Events': return '🍔';
      case 'Theatre': return '🎭';
      case 'Football': return '⚽';
      case 'Running': return '🏃';
      case 'Pickleball': return '🏓';
      case 'Movies': return '🎬';
      default: return '📍';
    }
  };

  // Filter events by Search Query
  const filteredEvents = useMemo(() => {
    return events.filter((event: any) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        event.title.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.category.toLowerCase().includes(query)
      );
    });
  }, [events, searchQuery]);

  return (
    <div className="explore-container-fullscreen ios-theme">
      
      {/* 90-95% screen map viewport */}
      <div className="map-view-hero">
        <MapContainer
          center={HYDERABAD_CENTER}
          zoom={11}
          scrollWheelZoom={true}
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            key={theme}
            url={
              theme === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
            attribution={
              theme === 'dark'
                ? '© OpenStreetMap contributors © CARTO'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
          />

          {/* Optional radius boundary from Settings toggles */}
          {showRadiusBoundary && (
            <Circle
              center={HYDERABAD_CENTER}
              radius={10000} // Mock 10km boundary circle
              pathOptions={{
                color: theme === 'dark' ? '#E9DCBE' : '#0071E3',
                fillColor: theme === 'dark' ? '#E9DCBE' : '#0071E3',
                fillOpacity: 0.05,
                weight: 1.5,
                dashArray: '5, 8'
              }}
            />
          )}

          {/* Event Markers */}
          {filteredEvents.map((event: any) => {
            const isSelected = selectedEventId === event.id;
            const emoji = getCategoryEmoji(event.category);
            const customIcon = L.divIcon({
              html: `
                <div class="premium-map-pin ${isSelected ? 'selected' : ''}">
                  <span class="pin-emoji-container">${emoji}</span>
                  <span class="pin-pulse-ring"></span>
                </div>
              `,
              className: 'custom-marker-icon',
              iconSize: [46, 46],
              iconAnchor: [23, 46]
            });

            return (
              <Marker
                key={event.id}
                position={event.coordinates}
                icon={customIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedEventId(event.id);
                  }
                }}
              >
                <Popup closeButton={false} minWidth={240}>
                  <div className="map-popup-card ios-style">
                    <span className="map-popup-tag">{event.category}</span>
                    <h4 className="map-popup-title">{event.title}</h4>
                    <div className="map-popup-row">
                      <Calendar size={12} />
                      <span>{event.date}</span>
                    </div>
                    <div className="map-popup-row">
                      <MapPin size={12} />
                      <span>{event.venue}</span>
                    </div>
                    <div className="map-popup-actions">
                      <button 
                        type="button" 
                        className="map-popup-btn join-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Successfully joined event: "${event.title}"!`);
                        }}
                      >
                        Join Event
                      </button>
                      <button 
                        type="button" 
                        className="map-popup-btn details-btn"
                        onClick={() => handleViewDetails(event)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          <MapController center={mapCenter} zoom={mapZoom} />
        </MapContainer>
      </div>

      {/* FLOATING VERTICAL CONTROL BAR */}
      <div className="vertical-control-pill glass-card animate-scaleIn">
        <button 
          type="button" 
          className="control-pill-btn theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button 
          type="button" 
          className={`control-pill-btn notifications-btn ${isNotificationsOpen ? 'active' : ''}`}
          onClick={() => {
            setIsNotificationsOpen(true);
            setIsSearchOpen(false);
            setIsSettingsOpen(false);
          }}
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="notif-pill-dot"></span>
        </button>
        <button 
          type="button" 
          className={`control-pill-btn search-btn ${isSearchOpen ? 'active' : ''}`}
          onClick={() => {
            setIsSearchOpen(true);
            setIsNotificationsOpen(false);
            setIsSettingsOpen(false);
          }}
          aria-label="Search Events"
        >
          <Search size={20} />
        </button>
        <button 
          type="button" 
          className={`control-pill-btn settings-btn ${isSettingsOpen ? 'active' : ''}`}
          onClick={() => {
            setIsSettingsOpen(true);
            setIsSearchOpen(false);
            setIsNotificationsOpen(false);
          }}
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Floating Apple Zoom controls */}
      <div className="ios-zoom-controls">
        <button type="button" onClick={() => setMapZoom(prev => Math.min(prev + 1, 18))} aria-label="Zoom In">＋</button>
        <button type="button" onClick={() => setMapZoom(prev => Math.max(prev - 1, 3))} aria-label="Zoom Out">－</button>
      </div>

      {/* EXPANDABLE SEARCH MODAL CARD */}
      {isSearchOpen && (
        <>
          <div className="search-panel-backdrop" onClick={() => setIsSearchOpen(false)} />
          <div className="search-panel-container ios-style animate-slideDown">
            <div className="search-panel-header">
              <div className="search-input-box">
                <Search size={16} className="search-box-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search events, venues, locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchSubmit(searchQuery);
                    }
                  }}
                />
                {searchQuery && (
                  <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <button 
                type="button" 
                className="close-search-panel-btn" 
                onClick={() => setIsSearchOpen(false)}
                aria-label="Close search"
              >
                <X size={18} />
              </button>
            </div>

            <div className="search-panel-body">
              
              {/* Quick Categories */}
              <div className="search-panel-section">
                <h4>Quick Categories</h4>
                <div className="quick-filters-grid">
                  {['Sports', 'Entertainment', 'Food Events', 'Music', 'Open Mic', 'Theatre'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className="quick-filter-tag"
                      onClick={() => handleQuickFilterClick(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="search-panel-section">
                  <div className="section-title-row">
                    <h4>Recent Searches</h4>
                    <button className="clear-all-btn" onClick={clearRecentSearches}>Clear All</button>
                  </div>
                  <div className="recent-list">
                    {recentSearches.map((term, index) => (
                      <div 
                        key={index} 
                        className="recent-item" 
                        onClick={() => handleSearchSubmit(term)}
                      >
                        <Clock size={12} className="recent-icon" />
                        <span className="recent-text">{term}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending suggestions */}
              <div className="search-panel-section">
                <h4>Trending Events</h4>
                <div className="trending-list">
                  {events.slice(0, 3).map((event: any) => (
                    <div 
                      key={event.id} 
                      className="trending-item"
                      onClick={() => handleSelectTrendingEvent(event)}
                    >
                      <span className="trending-icon">🔥</span>
                      <div className="trending-details">
                        <span className="trending-name">{event.title}</span>
                        <span className="trending-venue">{event.venue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* iOS-STYLE NOTIFICATIONS PANEL */}
      {isNotificationsOpen && (
        <>
          <div className="ios-panel-backdrop" onClick={() => setIsNotificationsOpen(false)} />
          <div className="ios-panel-container glass-card-strong animate-slideInRight">
            <header className="ios-panel-header">
              <h3>Notifications</h3>
              <button type="button" className="ios-panel-close-btn" onClick={() => setIsNotificationsOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="ios-panel-body">
              <div className="ios-notif-card">
                <div className="ios-notif-badge sports">Sports</div>
                <h4>🏏 Cricket Tournament starts tomorrow</h4>
                <p>Matches begin at 09:00 AM at Miyapur Play Ground.</p>
                <span className="ios-notif-time">2h ago</span>
              </div>
              <div className="ios-notif-card">
                <div className="ios-notif-badge entertainment">Music</div>
                <h4>🎵 Music Concert at Hitech City</h4>
                <p>Tickets are selling out fast. Secure yours today.</p>
                <span className="ios-notif-time">5h ago</span>
              </div>
              <div className="ios-notif-card">
                <div className="ios-notif-badge entertainment">Food</div>
                <h4>🍔 Food Festival in Gachibowli</h4>
                <p>Trending food bazaar this weekend. Opens Sunday noon.</p>
                <span className="ios-notif-time">1d ago</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* iOS-STYLE SETTINGS PANEL */}
      {isSettingsOpen && (
        <>
          <div className="ios-panel-backdrop" onClick={() => setIsSettingsOpen(false)} />
          <div className="ios-panel-container glass-card-strong animate-slideInRight">
            <header className="ios-panel-header">
              <h3>Settings</h3>
              <button type="button" className="ios-panel-close-btn" onClick={() => setIsSettingsOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="ios-panel-body">
              <div className="ios-settings-group">
                <h4>Map Toggles</h4>
                <div className="ios-setting-row">
                  <span>Traffic Overlay</span>
                  <label className="ios-switch">
                    <input 
                      type="checkbox" 
                      checked={enableMapTraffic}
                      onChange={(e) => setEnableMapTraffic(e.target.checked)}
                    />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
                <div className="ios-setting-row">
                  <span>Satellite View</span>
                  <label className="ios-switch">
                    <input 
                      type="checkbox" 
                      checked={enableMapSatellite}
                      onChange={(e) => setEnableMapSatellite(e.target.checked)}
                    />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
                <div className="ios-setting-row">
                  <span>10km Circle Overlay</span>
                  <label className="ios-switch">
                    <input 
                      type="checkbox" 
                      checked={showRadiusBoundary} 
                      onChange={(e) => setShowRadiusBoundary(e.target.checked)} 
                    />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
              </div>

              <div className="ios-settings-group">
                <h4>Theme</h4>
                <div className="ios-setting-row">
                  <span>Appearance</span>
                  <button className="ios-settings-action-btn" onClick={toggleTheme} type="button">
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </button>
                </div>
              </div>

              <div className="ios-settings-group">
                <h4>Account</h4>
                <div className="ios-setting-row">
                  <span>Signed in as</span>
                  <span className="ios-value-text">{localStorage.getItem('zenex-fullname') || 'Zenex Member'}</span>
                </div>
                <button className="ios-settings-secondary-btn" type="button" onClick={() => alert('Manage Account clicked')}>
                  Manage Account
                </button>
              </div>

              <div className="ios-settings-group">
                <h4>Notifications</h4>
                <div className="ios-setting-row">
                  <span>Push Alerts</span>
                  <label className="ios-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
                <div className="ios-setting-row">
                  <span>Email Updates</span>
                  <label className="ios-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
              </div>

              <div className="ios-settings-group">
                <h4>Privacy</h4>
                <div className="ios-setting-row">
                  <span>Location Access</span>
                  <label className="ios-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
                <div className="ios-setting-row">
                  <span>Share Activity</span>
                  <label className="ios-switch">
                    <input type="checkbox" />
                    <span className="ios-switch-slider"></span>
                  </label>
                </div>
              </div>

              <div className="ios-settings-group logout-group">
                <button className="ios-settings-logout-btn" type="button" onClick={() => {
                    setIsSettingsOpen(false);
                    alert('Logout clicked');
                  }}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default ExplorePage;
