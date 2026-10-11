import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Compass,
  Search,
  Globe,
  UserLock,
  Loader2,
  ImagePlus,
  Film,
  Users,
  Timer,
  MessageSquare,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { SPORTS_CATEGORIES, ENTERTAINMENT_CATEGORIES, createEventMapIcon } from './eventMapIcons';
import type { GameAccess } from './exploreEvents';
import MyPeopleListsSection from './MyPeopleListsSection';
import {
  loadPeopleLists,
  resolveMemberIdsFromLists,
  PEOPLE_LISTS_CHANGED_EVENT,
  type PeopleList,
} from '../HomeFeed/audienceLists';
import { isBackendEnabled } from '../../api/client';
import { uploadFile } from '../../api/uploadApi';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const DEFAULT_CENTER: [number, number] = [17.3969, 78.4692];

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

function createPinIcon(category: string) {
  return createEventMapIcon(category, true);
}

function MapResizeTrigger() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function MapFlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 15, { duration: 0.8 });
    }
  }, [target, map]);
  return null;
}

function LocationSelector({
  position,
  setPosition,
  category,
  onPinDrop,
}: {
  position: [number, number] | null;
  setPosition: (pos: [number, number]) => void;
  category: string;
  onPinDrop?: () => void;
}) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      onPinDrop?.();
    },
  });

  return position ? <Marker position={position} icon={createPinIcon(category)} /> : null;
}

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (eventData: Record<string, unknown>) => void;
}

const SPORTS_CATEGORIES_LIST = [...SPORTS_CATEGORIES];
const ENTERTAINMENT_CATEGORIES_LIST = [...ENTERTAINMENT_CATEGORIES];

export const CreateEventModal: React.FC<CreateEventModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [eventName, setEventName] = useState('');
  const [mainCategory, setMainCategory] = useState<'Sports' | 'Entertainment'>('Sports');
  const [subCategory, setSubCategory] = useState('Cricket');
  const [gameAccess, setGameAccess] = useState<GameAccess>('public');
  const [selectedInviteListIds, setSelectedInviteListIds] = useState<string[]>([]);
  const [peopleLists, setPeopleLists] = useState<PeopleList[]>(() => loadPeopleLists());
  const [date, setDate] = useState(todayInputValue);
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(DEFAULT_CENTER);
  const [mapFlyTarget, setMapFlyTarget] = useState<[number, number] | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState<NominatimResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const [media, setMedia] = useState<{ type: 'image' | 'video'; url: string } | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [limitedSlots, setLimitedSlots] = useState(false);
  const [slots, setSlots] = useState('10');
  const [joinCloseDate, setJoinCloseDate] = useState('');
  const [joinCloseTime, setJoinCloseTime] = useState('');
  const [createGroupChat, setCreateGroupChat] = useState(true);

  useEffect(() => {
    if (!isOpen) return undefined;
    const refreshLists = () => setPeopleLists(loadPeopleLists());
    refreshLists();
    window.addEventListener(PEOPLE_LISTS_CHANGED_EVENT, refreshLists);
    return () => window.removeEventListener(PEOPLE_LISTS_CHANGED_EVENT, refreshLists);
  }, [isOpen]);

  const toggleInviteList = (listId: string) => {
    setSelectedInviteListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId],
    );
  };

  useEffect(() => {
    if (mainCategory === 'Sports') {
      setSubCategory(SPORTS_CATEGORIES_LIST[0]);
    } else {
      setSubCategory(ENTERTAINMENT_CATEGORIES_LIST[0]);
    }
  }, [mainCategory]);

  const searchLocations = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setLocationResults([]);
      return;
    }

    setIsSearchingLocation(true);
    try {
      const params = new URLSearchParams({
        format: 'json',
        q: trimmed,
        limit: '5',
        countrycodes: 'in',
        viewbox: '78.0,17.0,79.2,17.8',
        bounded: '0',
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!response.ok) throw new Error('Search failed');
      const data = (await response.json()) as NominatimResult[];
      setLocationResults(data);
      setShowLocationResults(true);
    } catch {
      setLocationResults([]);
    } finally {
      setIsSearchingLocation(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = locationSearch.trim();
    if (trimmed.length < 3) {
      setLocationResults([]);
      setShowLocationResults(false);
      return;
    }

    const timer = window.setTimeout(() => {
      searchLocations(trimmed);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [locationSearch, isOpen, searchLocations]);

  const handleSelectLocation = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const coords: [number, number] = [lat, lng];
    setPosition(coords);
    setMapFlyTarget(coords);
    setVenue(result.display_name.split(',').slice(0, 2).join(', '));
    setLocationSearch(result.display_name.split(',').slice(0, 2).join(', '));
    setShowLocationResults(false);
    setLocationResults([]);
  };

  const downscaleImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1080;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('no ctx'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Live backend: upload the real file to R2/local-disk storage (see
    // backend/app/storage.py) and use the server's public URL, instead of
    // the base64/blob placeholder below that never left this browser tab.
    if (isBackendEnabled()) {
      setIsUploadingMedia(true);
      try {
        const uploaded = await uploadFile(file, file.name);
        setMedia({ type: uploaded.type, url: uploaded.url });
      } catch {
        toast.error('Could not upload the file. Please try again.');
      } finally {
        setIsUploadingMedia(false);
      }
      return;
    }

    if (file.type.startsWith('image/')) {
      try {
        const url = await downscaleImage(file);
        setMedia({ type: 'image', url });
      } catch {
        setMedia({ type: 'image', url: URL.createObjectURL(file) });
      }
    } else if (file.type.startsWith('video/')) {
      setMedia({ type: 'video', url: URL.createObjectURL(file) });
    }
  };

  const toggleLimitedSlots = () => {
    setLimitedSlots((prev) => {
      const next = !prev;
      // When enabling, default the joining deadline to the event start time.
      if (next) {
        if (!joinCloseDate && date) setJoinCloseDate(date);
        if (!joinCloseTime && time) setJoinCloseTime(time);
      }
      return next;
    });
  };

  const resetForm = () => {
    setEventName('');
    setMainCategory('Sports');
    setSubCategory('Cricket');
    setGameAccess('public');
    setSelectedInviteListIds([]);
    setDate(todayInputValue());
    setTime('');
    setVenue('');
    setDescription('');
    setPosition(DEFAULT_CENTER);
    setMapFlyTarget(null);
    setLocationSearch('');
    setLocationResults([]);
    setShowLocationResults(false);
    setMedia(null);
    setIsUploadingMedia(false);
    setLimitedSlots(false);
    setSlots('10');
    setJoinCloseDate('');
    setJoinCloseTime('');
    setCreateGroupChat(true);
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingMedia) {
      toast.error('Please wait for the upload to finish.');
      return;
    }
    if (!eventName || !venue || !date || !time || !position) {
      alert('Please fill out all required fields and select a location on the map.');
      return;
    }
    if (date < todayInputValue()) {
      toast.error('Pick today or a future date. Past events cannot be hosted.');
      setDate(todayInputValue());
      return;
    }
    if (limitedSlots && joinCloseDate && joinCloseDate < todayInputValue()) {
      toast.error('Joining cannot close on a past date.');
      return;
    }
    if (limitedSlots && joinCloseDate && date && joinCloseDate > date) {
      toast.error('Joining must close on or before the event date.');
      return;
    }

    if (limitedSlots) {
      if (!Number(slots) || Number(slots) < 1) {
        alert('Enter how many slots are open (at least 1).');
        return;
      }
      if (!joinCloseDate || !joinCloseTime) {
        alert('Set the date & time when slot joining closes.');
        return;
      }
    }

    if (gameAccess === 'invite') {
      if (selectedInviteListIds.length === 0) {
        alert('Select at least one list for invite-only events.');
        return;
      }
      const invitees = resolveMemberIdsFromLists(selectedInviteListIds);
      if (invitees.length === 0) {
        alert('Selected lists have no members yet. Add Dabbed Up people to a list in My lists below.');
        return;
      }
    }

    let image = 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80';
    if (subCategory === 'Cricket') image = 'https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Music' || subCategory === 'Clubbing') image = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Screening') image = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Cosplaying') image = 'https://images.unsplash.com/photo-1535295972055-1c7624482085?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Basketball') image = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Tennis') image = 'https://images.unsplash.com/photo-1622163642999-958948900c39?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Football') image = 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Badminton') image = 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Running') image = 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Pickleball') image = 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Skateboard') image = 'https://images.unsplash.com/photo-1542770665-66a0b85d33f5?auto=format&fit=crop&w=600&q=80';
    else if (subCategory === 'Swimming') image = 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=80';

    // Once a live backend is configured, an uploaded poster photo is a real,
    // stable server URL — use it as the map pin's cover instead of the fixed
    // per-category stock photo. Mock mode keeps the stock photo unchanged
    // (its media is often just a local blob: URL that won't survive reload).
    if (isBackendEnabled() && media?.type === 'image') {
      image = media.url;
    }

    onSubmit({
      id: Date.now().toString(),
      title: eventName,
      category: subCategory,
      mainCategory,
      gameAccess,
      inviteListIds: gameAccess === 'invite' ? selectedInviteListIds : undefined,
      date,
      time,
      venue,
      location: venue,
      description,
      coordinates: position,
      attendees: 1,
      image,
      media,
      registrationType: limitedSlots ? 'limited' : 'open',
      slotsTotal: limitedSlots ? Number(slots) : undefined,
      registrationDeadline: limitedSlots ? `${joinCloseDate}T${joinCloseTime}` : undefined,
      createGroupChat,
    });

    resetForm();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-card ios-bottom-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-handle"></div>
        <header className="modal-header">
          <div className="modal-title-group">
            <Compass className="modal-title-icon" size={20} />
            <h3>Create New Event</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form create-event-form">
          <div className="modal-form-scroll-container">
            <section className="create-event-section">
              <h4 className="create-event-section-title">Event details</h4>
              <div className="form-group">
                <label htmlFor="eventName">Event name</label>
                <input
                  id="eventName"
                  type="text"
                  placeholder="e.g. Hyderabad Pickleball Open"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <div className="category-toggle-group">
                  <button
                    type="button"
                    className={`category-toggle-btn ${mainCategory === 'Sports' ? 'active' : ''}`}
                    onClick={() => setMainCategory('Sports')}
                  >
                    Sports
                  </button>
                  <button
                    type="button"
                    className={`category-toggle-btn ${mainCategory === 'Entertainment' ? 'active' : ''}`}
                    onClick={() => setMainCategory('Entertainment')}
                  >
                    Entertainment
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="subCategory">Subcategory</label>
                <select
                  id="subCategory"
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                >
                  {mainCategory === 'Sports'
                    ? SPORTS_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))
                    : ENTERTAINMENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                </select>
              </div>
            </section>

            <section className="create-event-section">
              <h4 className="create-event-section-title">Game access</h4>
              <p className="field-hint">Choose who can see and join this event.</p>
              <div className="game-access-toggle">
                <button
                  type="button"
                  className={`game-access-option ${gameAccess === 'public' ? 'active' : ''}`}
                  onClick={() => {
                    setGameAccess('public');
                    setSelectedInviteListIds([]);
                  }}
                >
                  <span className="game-access-icon">
                    <Globe size={18} />
                  </span>
                  <span className="game-access-copy">
                    <strong>Public</strong>
                    <span>Anyone on Explore can find and join</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`game-access-option ${gameAccess === 'invite' ? 'active' : ''}`}
                  onClick={() => setGameAccess('invite')}
                >
                  <span className="game-access-icon invite">
                    <UserLock size={18} />
                  </span>
                  <span className="game-access-copy">
                    <strong>Invite</strong>
                    <span>Only people you invite can join</span>
                  </span>
                </button>
              </div>

              {gameAccess === 'invite' && (
                <div className="invite-lists-picker">
                  <p className="field-hint invite-lists-picker-hint">
                    Choose lists for invite-only events on the <strong>Mates</strong> map. Public
                    events from Dabbed Up people already show there too.
                  </p>
                  {peopleLists.length === 0 ? (
                    <p className="field-hint invite-lists-empty">
                      Create a list in <strong>My lists</strong> below, add Dabbed Up people, then
                      select it here.
                    </p>
                  ) : (
                    <div className="people-lists-row invite-lists-row">
                      {peopleLists.map((list) => {
                        const isSelected = selectedInviteListIds.includes(list.id);
                        return (
                          <button
                            key={list.id}
                            type="button"
                            className={`people-list-chip ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => toggleInviteList(list.id)}
                            aria-pressed={isSelected}
                          >
                            <span className="people-list-chip-name">{list.name}</span>
                            <span className="people-list-chip-count">{list.memberIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="create-event-section">
              <h4 className="create-event-section-title">Group chat</h4>
              <button
                type="button"
                className={`slots-toggle ${createGroupChat ? 'is-on' : ''}`}
                onClick={() => setCreateGroupChat((v) => !v)}
                aria-pressed={createGroupChat}
              >
                <span className="slots-toggle-icon">
                  <MessageSquare size={16} />
                </span>
                <span className="slots-toggle-copy">
                  <strong>Create group chat</strong>
                  <span>
                    {createGroupChat
                      ? 'On — opens a GC for this event when you publish'
                      : 'Off — no group chat for this event'}
                  </span>
                </span>
                <span className="slots-toggle-pill" aria-hidden="true">
                  <span className="slots-toggle-knob" />
                </span>
              </button>
            </section>

            <section className="create-event-section">
              <h4 className="create-event-section-title">When & where</h4>
              <div className="form-row form-row--schedule">
                <div className="form-group">
                  <label htmlFor="date">Date</label>
                  <div className="input-with-icon">
                    <Calendar size={16} className="input-icon" />
                    <input
                      id="date"
                      type="date"
                      min={todayInputValue()}
                      value={date}
                      onChange={(e) => setDate(e.target.value < todayInputValue() ? todayInputValue() : e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="time">Time</label>
                  <div className="input-with-icon">
                    <Clock size={16} className="input-icon" />
                    <input
                      id="time"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="venue">Venue / address</label>
                <div className="input-with-icon">
                  <MapPin size={16} className="input-icon" />
                  <input
                    id="venue"
                    type="text"
                    placeholder="e.g. Gachibowli Stadium Arena, Hyderabad"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    required
                  />
                </div>
              </div>
            </section>

            <section className="create-event-section">
              <h4 className="create-event-section-title">Registration & timer</h4>
              <button
                type="button"
                className={`slots-toggle ${limitedSlots ? 'is-on' : ''}`}
                onClick={toggleLimitedSlots}
                aria-pressed={limitedSlots}
              >
                <span className="slots-toggle-icon">
                  <Users size={16} />
                </span>
                <span className="slots-toggle-copy">
                  <strong>Limited slots</strong>
                  <span>
                    {limitedSlots
                      ? 'Capped spots with a joining deadline countdown'
                      : 'Off — open to join until the event starts'}
                  </span>
                </span>
                <span className="slots-toggle-pill" aria-hidden="true">
                  <span className="slots-toggle-knob" />
                </span>
              </button>

              {limitedSlots ? (
                <div className="slots-fields">
                  <div className="form-group">
                    <label htmlFor="slots">Slots open</label>
                    <div className="input-with-icon">
                      <Users size={16} className="input-icon" />
                      <input
                        id="slots"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        placeholder="e.g. 10"
                        value={slots}
                        onChange={(e) => setSlots(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row form-row--schedule">
                    <div className="form-group">
                      <label htmlFor="joinCloseDate">Joining closes — date</label>
                      <div className="input-with-icon">
                        <Calendar size={16} className="input-icon" />
                        <input
                          id="joinCloseDate"
                          type="date"
                          min={todayInputValue()}
                          max={date || undefined}
                          value={joinCloseDate}
                          onChange={(e) => setJoinCloseDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="joinCloseTime">Time</label>
                      <div className="input-with-icon">
                        <Clock size={16} className="input-icon" />
                        <input
                          id="joinCloseTime"
                          type="time"
                          value={joinCloseTime}
                          onChange={(e) => setJoinCloseTime(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="field-hint slots-hint">
                    <Timer size={13} /> Your post shows a live countdown to this deadline.
                  </p>
                </div>
              ) : (
                <p className="field-hint slots-hint">
                  <Timer size={13} /> Your post shows a live countdown to the event start time.
                </p>
              )}
            </section>

            <section className="create-event-section">
              <h4 className="create-event-section-title">More info</h4>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <div className="input-with-icon align-start">
                  <FileText size={16} className="input-icon textarea-icon" />
                  <textarea
                    id="description"
                    placeholder="This becomes your Home post caption. Tell people about your event..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Add photo or video <span className="label-optional">(optional)</span></label>
                <p className="field-hint">
                  Posted to Home automatically. Leave empty for a text post.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleMediaChange}
                  hidden
                />

                {!media ? (
                  <button
                    type="button"
                    className="media-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingMedia}
                  >
                    {isUploadingMedia ? (
                      <Loader2 size={18} className="media-upload-spinner" />
                    ) : (
                      <ImagePlus size={18} />
                    )}
                    <span>{isUploadingMedia ? 'Uploading…' : 'Upload image or video'}</span>
                  </button>
                ) : (
                  <div className="media-preview">
                    {media.type === 'image' ? (
                      <img src={media.url} alt="Selected media" />
                    ) : (
                      <video src={media.url} muted playsInline />
                    )}
                    <span className="media-preview-type">
                      {media.type === 'image' ? <ImagePlus size={13} /> : <Film size={13} />}
                      {media.type}
                    </span>
                    <button
                      type="button"
                      className="media-preview-remove"
                      onClick={() => setMedia(null)}
                      aria-label="Remove media"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="create-event-section create-event-section--map">
              <h4 className="create-event-section-title">Pin on map</h4>
              <p className="field-hint">Tap the map to set where your event appears on Explore.</p>
              <div className="modal-mini-map-container">
                <MapContainer
                  center={DEFAULT_CENTER}
                  zoom={12}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
                  <LocationSelector
                    position={position}
                    setPosition={setPosition}
                    category={subCategory}
                    onPinDrop={() => setShowLocationResults(false)}
                  />
                  <MapFlyTo target={mapFlyTarget} />
                  <MapResizeTrigger />
                </MapContainer>
              </div>

              <div className="location-search-block">
                <label htmlFor="locationSearch">Search location</label>
                <div className="location-search-input-wrap">
                  <Search size={16} className="location-search-icon" />
                  <input
                    id="locationSearch"
                    type="search"
                    placeholder="Search venue, area, or address..."
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
                    autoComplete="off"
                  />
                  {isSearchingLocation && (
                    <Loader2 size={16} className="location-search-spinner" aria-hidden="true" />
                  )}
                </div>

                {showLocationResults && locationResults.length > 0 && (
                  <ul className="location-search-results">
                    {locationResults.map((result) => (
                      <li key={result.place_id}>
                        <button
                          type="button"
                          className="location-search-result"
                          onClick={() => handleSelectLocation(result)}
                        >
                          <MapPin size={14} />
                          <span>{result.display_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {showLocationResults &&
                  !isSearchingLocation &&
                  locationSearch.trim().length >= 3 &&
                  locationResults.length === 0 && (
                    <p className="location-search-empty">No locations found. Try a different search.</p>
                  )}
              </div>

              {position && (
                <div className="coordinates-indicator">
                  <span>Lat: {position[0].toFixed(5)}</span>
                  <span>Lng: {position[1].toFixed(5)}</span>
                </div>
              )}
            </section>

            <MyPeopleListsSection />
          </div>

          <footer className="modal-footer create-event-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              Create Event
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default CreateEventModal;
