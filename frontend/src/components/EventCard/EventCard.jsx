import { Calendar, MapPin } from 'lucide-react';
import './EventCard.css';

const avatarColors = ['#7B61FF', '#4DA3FF', '#FF4FD8'];

function EventCard({ title, category, date, time, location, attendees, image, onRSVP, fullWidth }) {
  return (
    <div className={`event-card${fullWidth ? ' event-card-full' : ''}`}>
      {/* Image area */}
      <div className="event-card-image">
        {image ? (
          <img src={image} alt={title} className="event-card-image-bg" />
        ) : (
          <div className="event-card-image-placeholder" />
        )}
        <span className="event-card-category">{category}</span>
      </div>

      {/* Content */}
      <div className="event-card-content">
        <h4 className="event-card-title">{title}</h4>

        <div className="event-card-info">
          <Calendar size={14} />
          <span>{date}{time ? ` · ${time}` : ''}</span>
        </div>

        <div className="event-card-info">
          <MapPin size={14} />
          <span>{location}</span>
        </div>

        <div className="event-card-footer">
          {/* Attendee stack */}
          <div className="event-card-attendees">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="event-card-avatar"
                style={{ background: avatarColors[i] }}
              >
                <span style={{ color: '#fff', fontSize: 10 }}>
                  {String.fromCharCode(65 + i)}
                </span>
              </div>
            ))}
            {attendees > 3 && (
              <div className="event-card-avatar event-card-avatar-count">
                +{attendees - 3}
              </div>
            )}
          </div>

          <button
            className="event-card-rsvp"
            onClick={(e) => {
              e.stopPropagation();
              onRSVP?.();
            }}
          >
            RSVP
          </button>
        </div>
      </div>
    </div>
  );
}

export default EventCard;
