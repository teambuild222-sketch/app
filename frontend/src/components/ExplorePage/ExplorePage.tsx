import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Bell, MapPin, Calendar, Clock, Settings, Sun, Moon, X, ChevronDown, Plus, LocateFixed } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { toast } from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import './ExplorePage.css';
import './userLocationMarker.css';
import './eventMapIcons.css';
import { createEventMapIcon, SPORTS_CATEGORIES, ENTERTAINMENT_CATEGORIES, isWeightliftingCategory } from './eventMapIcons';
import {
  getPreferredFiltersForMain,
  USER_INTERESTS_CHANGED_EVENT,
} from './profileExploreInterests';

const RECENT_SUBFILTERS_KEY = 'simsor-explore-recent-subfilters';

type MainCategory = 'Sports' | 'Entertainment';
type RecentSubFiltersByMain = Record<MainCategory, string[]>;

function loadRecentSubFilters(): RecentSubFiltersByMain {
  try {
    const saved = localStorage.getItem(RECENT_SUBFILTERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<RecentSubFiltersByMain>;
      return {
        Sports: Array.isArray(parsed.Sports) ? parsed.Sports : [],
        Entertainment: Array.isArray(parsed.Entertainment) ? parsed.Entertainment : [],
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { Sports: [], Entertainment: [] };
}
import { LocationMapPopup } from './LocationMapPopup';
import { CreateEventModal } from './CreateEventModal';
import ConfirmDialog from '../common/ConfirmDialog';
import { ensureEventChat, removeEventChat } from '../common/eventChats';
import { UserPlus } from 'lucide-react';
import { UserLocationMarker } from './UserLocationMarker.tsx';
import { useUserLocation } from './useUserLocation';
import {
  INITIAL_EVENTS,
  loadExploreEvents,
  mergeSeedEvents,
  EXPLORE_EVENTS_CHANGED_EVENT,
  getEventOrganizer,
  groupEventsByLocation,
  locationKeyFromCoordinates,
  getCurrentViewerId,
  isKnownOrganizerId,
  cacheRemoteOrganizer,
  type ExploreEvent,
  openEventInGoogleMaps,
} from './exploreEvents';
import { canViewOnPrivateMap, canViewOnPublicMap } from './mapEventAccess';
import {
  submitCreateEvent,
  isJoined as isEventJoined,
  toggleJoinAsync as toggleEventJoinAsync,
  type CreateEventPayload,
} from '../HomeFeed/publishContent';
import { trackCategoryInteraction } from '../HomeFeed/feedAlgorithm';
import { useTheme } from '../../themeContext';
import { getDabbedUpIds, DAB_UPS_CHANGED_EVENT } from '../profile/profileData';
import { PEOPLE_LISTS_CHANGED_EVENT } from '../HomeFeed/audienceLists';
import type { MapEventScope } from '../Navbar';
import { isBackendEnabled } from '../../api/client';
import { listEvents } from '../../api/eventsApi';
import { fetchPublicUser } from '../../api/usersApi';
import type { EventDto } from '../../api/types';

function eventDtoToExploreEvent(dto: EventDto): ExploreEvent {
  return {
    id: dto.id,
    title: dto.title,
    category: dto.category,
    mainCategory: dto.mainCategory,
    date: dto.date,
    time: dto.time,
    venue: dto.venue,
    location: dto.location,
    description: dto.description,
    coordinates: dto.coordinates,
    attendees: dto.attendees,
    image: dto.image,
    organizerId: dto.organizerId,
    gameAccess: dto.gameAccess,
    inviteListIds: dto.inviteListIds,
    invitedMemberIds: dto.invitedMemberIds,
  };
}

const HYDERABAD_CENTER: [number, number] = [17.3969, 78.4692];

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Sample events across all sports & entertainment categories – see exploreEvents.ts

type ExplorePageProps = {
  onViewOrganizerProfile?: (organizerId: string) => void;
  focusTarget?: {
    eventId: string;
    coordinates: [number, number];
    mainCategory?: 'Sports' | 'Entertainment';
  } | null;
  onFocusHandled?: () => void;
  mapEventScope?: MapEventScope;
};

function LocationMarker({
  coordinates,
  category,
  eventCount,
  isSelected,
  isPopupOpen,
  onSelect,
  children,
}: {
  coordinates: [number, number];
  category: string;
  eventCount: number;
  isSelected: boolean;
  isPopupOpen: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const markerRef = useRef<L.Marker>(null);
  const icon = useMemo(
    () => createEventMapIcon(category, isSelected, eventCount),
    [category, isSelected, eventCount]
  );

  useEffect(() => {
    if (isSelected) {
      markerRef.current?.openPopup();
    }
  }, [isSelected]);

  const handleMarkerClick = () => {
    if (isPopupOpen) return;
    onSelect();
  };

  return (
    <Marker
      ref={markerRef}
      position={coordinates}
      icon={icon}
      eventHandlers={{ click: handleMarkerClick }}
    >
      {children}
    </Marker>
  );
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 1.0 });
  }, [center, zoom, map]);
  return null;
}

function MapFlyToUser({
  target,
  trigger,
}: {
  target: { lat: number; lng: number } | null;
  trigger: number;
}) {
  const map = useMap();
  // Keep the latest position without making it an effect dependency, so live
  // GPS updates never recenter the map on their own – only an explicit trigger
  // (first fix or a locate-button tap) does.
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (trigger === 0) return;
    const current = targetRef.current;
    if (!current) return;
    map.flyTo([current.lat, current.lng], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.75,
    });
  }, [map, trigger]);

  return null;
}

export const ExplorePage: React.FC<ExplorePageProps> = ({
  onViewOrganizerProfile,
  focusTarget,
  onFocusHandled,
  mapEventScope = 'public',
}) => {
  const { theme, toggleTheme } = useTheme();
  const { position: userPosition, heading: userHeading, status: userLocationStatus, requestLocation } =
    useUserLocation();
  // Explore is unmounted/remounted every time you leave/re-enter the tab (see
  // Layout.tsx), so a fresh mount with a pending focusTarget must NOT let the
  // "center on my first GPS fix" effect below win the race once geolocation
  // resolves a moment later — that's what was silently snapping the map back
  // to the user's location instead of the event someone tapped "View location" on.
  const hasCenteredOnUserRef = useRef(Boolean(focusTarget));
  const pendingLocateRef = useRef(false);
  const [flyToUserTrigger, setFlyToUserTrigger] = useState(0);

  // Load events — from the live API once a backend is configured, otherwise
  // from the local mock store (unchanged behavior when VITE_API_URL is unset).
  const backendEnabled = isBackendEnabled();
  const [events, setEvents] = useState<ExploreEvent[]>(() => (backendEnabled ? [] : loadExploreEvents()));
  const [isLoadingLiveEvents, setIsLoadingLiveEvents] = useState(backendEnabled);

  useEffect(() => {
    if (backendEnabled) return;
    setEvents((prev) => mergeSeedEvents(prev));
  }, [backendEnabled]);

  useEffect(() => {
    if (backendEnabled) return undefined;
    const refresh = () => setEvents(loadExploreEvents());
    window.addEventListener(EXPLORE_EVENTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(EXPLORE_EVENTS_CHANGED_EVENT, refresh);
  }, [backendEnabled]);

  useEffect(() => {
    const onInterests = () => setInterestsVersion((v) => v + 1);
    window.addEventListener(USER_INTERESTS_CHANGED_EVENT, onInterests);
    return () => window.removeEventListener(USER_INTERESTS_CHANGED_EVENT, onInterests);
  }, []);

  useEffect(() => {
    const refreshDabbed = () => setDabbedOrganizerIds(getDabbedUpIds());
    refreshDabbed();
    window.addEventListener(DAB_UPS_CHANGED_EVENT, refreshDabbed);
    return () => window.removeEventListener(DAB_UPS_CHANGED_EVENT, refreshDabbed);
  }, []);

  useEffect(() => {
    const onListsChange = () => setPeopleListsVersion((v) => v + 1);
    window.addEventListener(PEOPLE_LISTS_CHANGED_EVENT, onListsChange);
    return () => window.removeEventListener(PEOPLE_LISTS_CHANGED_EVENT, onListsChange);
  }, []);

  // Toggles for iOS Floating Panels
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [joinConfirmEvent, setJoinConfirmEvent] = useState<ExploreEvent | null>(null);
  const [joinVersion, setJoinVersion] = useState(0);

  // Search filter and query state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMainCategory, setActiveMainCategory] = useState<'Sports' | 'Entertainment'>('Sports');
  const [activeSubFilter, setActiveSubFilter] = useState<string | null>(null);
  const [recentSubFiltersByMain, setRecentSubFiltersByMain] = useState<RecentSubFiltersByMain>(
    loadRecentSubFilters,
  );
  const [isMainDropdownOpen, setIsMainDropdownOpen] = useState(false);
  const [isSubFilterExpanded, setIsSubFilterExpanded] = useState(false);
  const [interestsVersion, setInterestsVersion] = useState(0);
  const [dabbedOrganizerIds, setDabbedOrganizerIds] = useState<string[]>(() => getDabbedUpIds());
  const [peopleListsVersion, setPeopleListsVersion] = useState(0);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('simsor-recent-searches-v3');
    return saved ? JSON.parse(saved) : [];
  });

  // Map viewport panning controller
  const [mapCenter, setMapCenter] = useState<[number, number]>(HYDERABAD_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [openLocationKey, setOpenLocationKey] = useState<string | null>(null);

  // Settings mock toggles
  const [showRadiusBoundary, setShowRadiusBoundary] = useState(false);
  const [enableMapTraffic, setEnableMapTraffic] = useState(false);
  const [enableMapSatellite, setEnableMapSatellite] = useState(false);

  // Autofocus ref for search
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- Live backend event loading (skipped entirely in mock mode) ---
  // Deliberately category-only — no lat/lng/radiusKm. There's no
  // radius-picker UI, and events are seeded around fixed demo coordinates
  // unrelated to the viewer's real GPS position, so auto-filtering by live
  // distance from the device previously hid every event (new and
  // pre-existing) whenever the viewer's real location was far from that
  // cluster. The backend still supports radius filtering for when a real
  // "nearby" control is added.
  const fetchLiveEvents = useCallback(async (categoryOverride?: 'Sports' | 'Entertainment') => {
    if (!backendEnabled) return;
    setIsLoadingLiveEvents(true);
    try {
      const dtos = await listEvents({ mainCategory: categoryOverride ?? activeMainCategory });
      const fetched = dtos.map(eventDtoToExploreEvent);
      setEvents(fetched);

      // Resolve display info for any host we don't already know about.
      const unknownIds = [...new Set(fetched.map((e) => e.organizerId))].filter(
        (id) => !isKnownOrganizerId(id),
      );
      if (unknownIds.length > 0) {
        const profiles = await Promise.all(unknownIds.map((id) => fetchPublicUser(id)));
        profiles.forEach((profile, i) => {
          if (profile) cacheRemoteOrganizer(unknownIds[i], profile);
        });
        // New array reference so memoized filters/popups re-render with the
        // now-cached organizer info (getEventOrganizer itself stays sync).
        setEvents((prev) => [...prev]);
      }
    } catch {
      toast.error('Could not load events from the server.');
    } finally {
      setIsLoadingLiveEvents(false);
    }
  }, [backendEnabled, activeMainCategory]);

  // Refetch on mount and whenever the category tab changes.
  useEffect(() => {
    void fetchLiveEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendEnabled, activeMainCategory]);

  useEffect(() => {
    if (!userPosition) return;

    if (!hasCenteredOnUserRef.current) {
      hasCenteredOnUserRef.current = true;
      setMapCenter([userPosition.lat, userPosition.lng]);
      setMapZoom(15);
      setFlyToUserTrigger(1);
      return;
    }

    if (pendingLocateRef.current) {
      pendingLocateRef.current = false;
      setMapCenter([userPosition.lat, userPosition.lng]);
      setMapZoom((prev) => Math.max(prev, 15));
      setFlyToUserTrigger((n) => n + 1);
    }
  }, [userPosition]);

  const handleLocateMe = () => {
    if (userPosition) {
      setMapCenter([userPosition.lat, userPosition.lng]);
      setMapZoom((prev) => Math.max(prev, 15));
      setFlyToUserTrigger((n) => n + 1);
    } else {
      pendingLocateRef.current = true;
    }
    requestLocation(true);
  };

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
        setIsMainDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close main category dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setIsMainDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync state to localStorage (mock mode only — live-mode events are owned
  // by the backend and shouldn't be mirrored into the mock dataset).
  useEffect(() => {
    if (backendEnabled) return;
    localStorage.setItem('simsor-explore-events-v4', JSON.stringify(events));
  }, [events, backendEnabled]);

  useEffect(() => {
    localStorage.setItem('simsor-recent-searches-v3', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    localStorage.setItem(RECENT_SUBFILTERS_KEY, JSON.stringify(recentSubFiltersByMain));
  }, [recentSubFiltersByMain]);

  // Focus a specific event location (e.g. from a Home feed post's "View location").
  useEffect(() => {
    if (!focusTarget) return;

    const target = events.find((e) => e.id === focusTarget.eventId);
    const coordinates = target?.coordinates ?? focusTarget.coordinates;
    const key = locationKeyFromCoordinates(coordinates);

    // A pin only renders under its own category tab, and a sub-filter can hide
    // it even then, so clear the way before selecting it.
    const mainCategory = target?.mainCategory ?? focusTarget.mainCategory;
    if (mainCategory) {
      setActiveMainCategory(mainCategory);
      setActiveSubFilter(null);
    }

    setMapCenter(coordinates);
    setMapZoom(15);
    setOpenLocationKey(key);
    setSelectedEventId(focusTarget.eventId);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

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
  const handleSelectTrendingEvent = (event: ExploreEvent) => {
    setMapCenter(event.coordinates);
    setMapZoom(14);
    setOpenLocationKey(locationKeyFromCoordinates(event.coordinates));
    setSelectedEventId(event.id);
    setIsSearchOpen(false);
  };

  const handleJoinEvent = (event: ExploreEvent) => {
    // Already joined → leave directly; otherwise confirm before joining.
    if (isEventJoined(event.id)) {
      void toggleEventJoinAsync(event.id).then((joined) => {
        if (!joined) removeEventChat(event.id);
        setJoinVersion((v) => v + 1);
        toast(`Left "${event.title}"`);
      });
      return;
    }
    setJoinConfirmEvent(event);
  };

  const confirmJoinEvent = () => {
    if (joinConfirmEvent) {
      const event = joinConfirmEvent;
      void toggleEventJoinAsync(event.id).then((joined) => {
        if (!joined) return;
        const organizer = getEventOrganizer(event);
        ensureEventChat({
          eventId: event.id,
          title: event.title,
          category: event.category,
          avatar: organizer.avatar,
          hostName: organizer.name,
          hostId: organizer.id,
        });
        setJoinVersion((v) => v + 1);
        toast.success(`You joined "${event.title}"! Added to the group chat 💬`, {
          icon: '🎉',
        });
      });
    }
    setJoinConfirmEvent(null);
  };

  const handleOpenLocation = (event: ExploreEvent) => {
    openEventInGoogleMaps(event);
  };

  const handleOrganizerClick = (event: ExploreEvent) => {
    const organizer = getEventOrganizer(event);
    if (onViewOrganizerProfile) {
      onViewOrganizerProfile(organizer.id);
      return;
    }
    toast('Open Discover to view organizer profiles', { icon: '👤' });
  };

  const focusOnCreatedEvent = (mainCategory: 'Sports' | 'Entertainment', coordinates: [number, number], id: string) => {
    // Switch the filter to match the new event so its pin is actually visible.
    setActiveMainCategory(mainCategory === 'Entertainment' ? 'Entertainment' : 'Sports');
    setActiveSubFilter(null);
    setMapCenter(coordinates);
    setMapZoom(14);
    setOpenLocationKey(locationKeyFromCoordinates(coordinates));
    setSelectedEventId(id);
  };

  const handleCreateEvent = async (eventData: Record<string, unknown>) => {
    const payload = eventData as unknown as CreateEventPayload;

    try {
      const created = await submitCreateEvent(payload);

      if (backendEnabled) {
        // Refetch with the NEW event's category explicitly — activeMainCategory
        // (the currently viewed tab) may differ from it, and the state update
        // from focusOnCreatedEvent below isn't visible in this closure yet.
        await fetchLiveEvents(created.mainCategory);
      } else {
        setEvents(loadExploreEvents());
      }

      focusOnCreatedEvent(created.mainCategory, created.coordinates, created.id);
      toast.success('Event created & posted to Home!');
    } catch {
      toast.error('Could not create the event. Please try again.');
    }
  };

  const quickFilterCategories = [...SPORTS_CATEGORIES, ...ENTERTAINMENT_CATEGORIES];

  const subFilterOptions =
    activeMainCategory === 'Sports' ? [...SPORTS_CATEGORIES] : [...ENTERTAINMENT_CATEGORIES];

  const interestSubFilters = useMemo(
    () => getPreferredFiltersForMain(activeMainCategory),
    [activeMainCategory, interestsVersion],
  );

  const orderedSubFilters = useMemo(() => {
    const interests = interestSubFilters.filter((filter) => subFilterOptions.includes(filter));
    const recent = recentSubFiltersByMain[activeMainCategory].filter(
      (filter) => subFilterOptions.includes(filter) && !interests.includes(filter),
    );
    const rest = subFilterOptions.filter(
      (filter) => !interests.includes(filter) && !recent.includes(filter),
    );
    return [...interests, ...recent, ...rest];
  }, [subFilterOptions, recentSubFiltersByMain, activeMainCategory, interestSubFilters]);

  /* Default collapsed size matches Entertainment’s compact chip count */
  const entertainmentDefaultCollapsed = Math.max(1, ENTERTAINMENT_CATEGORIES.length);
  const collapsedVisibleCount = Math.max(
    1,
    Math.min(subFilterOptions.length, entertainmentDefaultCollapsed),
  );
  const hasMoreSubFilters = subFilterOptions.length > collapsedVisibleCount;

  const visibleSubFilters = useMemo(() => {
    if (isSubFilterExpanded || !hasMoreSubFilters) {
      return orderedSubFilters;
    }

    let visible = orderedSubFilters.slice(0, collapsedVisibleCount);
    if (activeSubFilter && !visible.includes(activeSubFilter)) {
      visible = [
        activeSubFilter,
        ...visible.filter((filter) => filter !== activeSubFilter),
      ].slice(0, collapsedVisibleCount);
    }
    return visible;
  }, [
    orderedSubFilters,
    isSubFilterExpanded,
    hasMoreSubFilters,
    collapsedVisibleCount,
    activeSubFilter,
  ]);

  const subFilterLabel = (category: string) => {
    if (category === 'Music') return 'Music / DJ';
    return category;
  };

  const handleSubFilterClick = (filter: string | null) => {
    setActiveSubFilter(filter);
    if (!filter) return;

    setRecentSubFiltersByMain((prev) => {
      const current = prev[activeMainCategory];
      const next = [filter, ...current.filter((item) => item !== filter)];
      return { ...prev, [activeMainCategory]: next };
    });

    trackCategoryInteraction(filter, activeMainCategory, 'explore_subfilter');
  };

  const handleMainCategoryChange = (category: 'Sports' | 'Entertainment') => {
    setActiveMainCategory(category);
    setActiveSubFilter(null);
    setIsMainDropdownOpen(false);
    setIsSubFilterExpanded(false);
  };

  const dabbedOrganizerSet = useMemo(() => new Set(dabbedOrganizerIds), [dabbedOrganizerIds]);

  // Filter events by category + search query + public/private map scope
  const filteredEvents = useMemo(() => {
    return events.filter((event: ExploreEvent) => {
      if (event.mainCategory !== activeMainCategory) return false;
      if (activeSubFilter) {
        // "Weightlifting" is an umbrella filter – match heavy-lifting styles too.
        if (activeSubFilter === 'Weightlifting') {
          if (!isWeightliftingCategory(event.category)) return false;
        } else if (event.category !== activeSubFilter) {
          return false;
        }
      }

      if (mapEventScope === 'public') {
        if (!canViewOnPublicMap(event)) return false;
      } else if (!canViewOnPrivateMap(event, getCurrentViewerId(), dabbedOrganizerSet)) {
        return false;
      }

      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        event.title.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.category.toLowerCase().includes(query)
      );
    });
  }, [events, searchQuery, activeMainCategory, activeSubFilter, mapEventScope, dabbedOrganizerSet, peopleListsVersion]);

  const locationGroups = useMemo(
    () => groupEventsByLocation(filteredEvents),
    [filteredEvents]
  );

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
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />

          {showRadiusBoundary && (
            <Circle
              center={HYDERABAD_CENTER}
              radius={10000}
              pathOptions={{
                color: theme === 'dark' ? '#E9DCBE' : '#0071E3',
                fillColor: theme === 'dark' ? '#E9DCBE' : '#0071E3',
                fillOpacity: 0.05,
                weight: 1.5,
                dashArray: '5, 8',
              }}
            />
          )}

          {locationGroups.map((group) => {
            const isLocationOpen = openLocationKey === group.key;
            const hasSelectedEventInGroup = group.events.some((event) => event.id === selectedEventId);
            const isSelected = isLocationOpen || hasSelectedEventInGroup;
            const markerCategory = group.events[0].category;

            return (
              <LocationMarker
                key={group.key}
                coordinates={group.coordinates}
                category={markerCategory}
                eventCount={group.events.length}
                isSelected={isSelected}
                isPopupOpen={isLocationOpen}
                onSelect={() => {
                  setOpenLocationKey(group.key);
                  setSelectedEventId(group.events.length === 1 ? group.events[0].id : null);
                  const primary = group.events[0];
                  trackCategoryInteraction(
                    primary.category,
                    primary.mainCategory,
                    'explore_pin_open',
                    primary.organizerId,
                  );
                }}
              >
                <Popup
                  closeButton={false}
                  minWidth={260}
                  maxWidth={280}
                  eventHandlers={{
                    remove: () => {
                      if (openLocationKey === group.key) {
                        setOpenLocationKey(null);
                        setSelectedEventId(null);
                      }
                    },
                  }}
                >
                  <LocationMapPopup
                    locationKey={group.key}
                    events={group.events}
                    isOpen={isLocationOpen}
                    focusEventId={
                      selectedEventId &&
                      group.events.some((event) => event.id === selectedEventId)
                        ? selectedEventId
                        : null
                    }
                    onDetailEventChange={setSelectedEventId}
                    onJoin={handleJoinEvent}
                    onLocation={handleOpenLocation}
                    onOrganizerClick={handleOrganizerClick}
                    isJoined={(event) => {
                      void joinVersion;
                      return isEventJoined(event.id);
                    }}
                  />
                </Popup>
              </LocationMarker>
            );
          })}

          {userPosition && (
            <UserLocationMarker theme={theme} position={userPosition} heading={userHeading} />
          )}

          <MapFlyToUser target={userPosition} trigger={flyToUserTrigger} />
          <MapController center={mapCenter} zoom={mapZoom} />
        </MapContainer>
      </div>

      {/* TOP-LEFT FILTER BAR */}
      <div
        ref={filterBarRef}
        className={`explore-filter-bar explore-filter-bar--${activeMainCategory.toLowerCase()} animate-scaleIn`}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="explore-filter-main">
          <div className="explore-filter-row explore-filter-row--top">
            <div className="explore-filter-dropdown-wrap">
              <button
                type="button"
                className="explore-filter-dropdown-btn"
                onClick={() => setIsMainDropdownOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isMainDropdownOpen}
              >
                <span>{activeMainCategory}</span>
                <ChevronDown size={14} className={`explore-filter-chevron ${isMainDropdownOpen ? 'open' : ''}`} />
              </button>
              {isMainDropdownOpen && (
                <div className="explore-filter-dropdown-menu" role="listbox">
                  <button
                    type="button"
                    className={`explore-filter-dropdown-item ${activeMainCategory === 'Sports' ? 'active' : ''}`}
                    onClick={() => handleMainCategoryChange('Sports')}
                  >
                    Sports
                  </button>
                  <button
                    type="button"
                    className={`explore-filter-dropdown-item ${activeMainCategory === 'Entertainment' ? 'active' : ''}`}
                    onClick={() => handleMainCategoryChange('Entertainment')}
                  >
                    Entertainment
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="explore-filter-row explore-filter-row--chips">
            <div className="explore-filter-chips">
              <button
                type="button"
                className={`explore-filter-chip ${activeSubFilter === null ? 'active' : ''}`}
                onClick={() => handleSubFilterClick(null)}
              >
                All
              </button>
              {visibleSubFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`explore-filter-chip ${activeSubFilter === filter ? 'active' : ''} ${
                    interestSubFilters.includes(filter) ? 'explore-filter-chip--interest' : ''
                  }`}
                  onClick={() => handleSubFilterClick(filter)}
                >
                  {subFilterLabel(filter)}
                </button>
              ))}
              {hasMoreSubFilters && (
                <button
                  type="button"
                  className="explore-filter-chip explore-filter-chip--more"
                  onClick={() => setIsSubFilterExpanded((prev) => !prev)}
                  aria-expanded={isSubFilterExpanded}
                >
                  {isSubFilterExpanded ? 'Less' : '+ More'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FLOATING VERTICAL CONTROL BAR */}
      <div className="vertical-control-pill animate-scaleIn">
        <button 
          type="button" 
          className="control-pill-btn theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
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
          <Bell size={18} />
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
          <Search size={18} />
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
          <Settings size={18} />
        </button>
      </div>

      {backendEnabled && isLoadingLiveEvents && (
        <div className="explore-live-loading-pill" role="status">
          Loading events…
        </div>
      )}

      {/* Create event (bottom-left), above nav island */}
      <div className="explore-map-bottom-left-stack">
        <button
          type="button"
          className="explore-map-create-fab"
          onClick={() => setIsCreateOpen(true)}
          aria-label="Create event"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>
      <div className="ios-zoom-controls explore-map-zoom-controls">
        <button type="button" onClick={() => setMapZoom(prev => Math.min(prev + 1, 18))} aria-label="Zoom In">＋</button>
        <button type="button" onClick={() => setMapZoom(prev => Math.max(prev - 1, 3))} aria-label="Zoom Out">－</button>
      </div>
      <button
        type="button"
        className={`explore-map-locate-btn ${userLocationStatus === 'loading' ? 'is-loading' : ''}`}
        onClick={handleLocateMe}
        aria-label="Center map on my location"
        title="Center map on my location"
      >
        <LocateFixed size={20} strokeWidth={2.25} />
      </button>

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
                  {quickFilterCategories.map((filter) => (
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
                  <span className="ios-value-text">{localStorage.getItem('simsor-fullname') || 'Simsor Member'}</span>
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

      <CreateEventModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateEvent}
      />

      <ConfirmDialog
        open={joinConfirmEvent !== null}
        icon={<UserPlus size={24} />}
        title="Join this event?"
        message={
          joinConfirmEvent ? (
            <>
              Confirm your spot for <strong>{joinConfirmEvent.title}</strong> at{' '}
              {joinConfirmEvent.venue}.
            </>
          ) : null
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={confirmJoinEvent}
        onCancel={() => setJoinConfirmEvent(null)}
      />

    </div>
  );
};

export default ExplorePage;
