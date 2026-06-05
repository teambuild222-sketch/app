import { MapPin } from 'lucide-react';
import './PlayerCard.css';

const skillClassMap = {
  Beginner: 'skill-beginner',
  Intermediate: 'skill-intermediate',
  Advanced: 'skill-advanced',
  Pro: 'skill-pro',
};

function PlayerCard({ name, distance, sports = [], skillLevel, avatar, isOnline }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const visibleSports = sports.slice(0, 2);
  const skillClass = skillClassMap[skillLevel] || 'skill-beginner';

  return (
    <div className="player-card">
      {/* Avatar */}
      <div className="player-card-avatar-wrap">
        <div className={`player-card-avatar-ring ${isOnline ? 'online' : 'offline'}`}>
          {avatar ? (
            <img src={avatar} alt={name} className="player-card-avatar" />
          ) : (
            <div className="player-card-avatar-placeholder">{initials}</div>
          )}
        </div>
        {isOnline && <span className="player-card-online-dot" />}
      </div>

      {/* Info */}
      <span className="player-card-name">{name}</span>

      <span className="player-card-distance">
        <MapPin size={12} />
        {distance}
      </span>

      {/* Sports */}
      {visibleSports.length > 0 && (
        <div className="player-card-sports">
          {visibleSports.map((sport) => (
            <span key={sport} className="player-card-sport-chip">{sport}</span>
          ))}
        </div>
      )}

      {/* Skill */}
      <span className={`player-card-skill ${skillClass}`}>
        {skillLevel}
      </span>

      {/* Connect */}
      <button className="player-card-connect">Connect</button>
    </div>
  );
}

export default PlayerCard;
