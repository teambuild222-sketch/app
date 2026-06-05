import './ComingSoon.css';

const features = [
  'AI Matchmaking',
  'Video Highlights',
  'AI Recommendations',
  'Event Ticketing',
  'Advanced Leaderboards',
  'Creator Tools',
  'Premium Features',
];

function ComingSoon({ compact = false }) {
  return (
    <div className={`coming-soon gradient-border${compact ? ' compact' : ''}`}>
      <span className="coming-soon-emoji">🚀</span>
      <h3 className="coming-soon-title">Building Zenex Takes Time</h3>
      <p className="coming-soon-desc">
        We are continuously improving Zenex and rolling out new features.
      </p>

      <ul className="coming-soon-features">
        {features.map((feature) => (
          <li key={feature} className="coming-soon-feature">
            <span className="coming-soon-dot" />
            {feature}
          </li>
        ))}
      </ul>

      <button className="coming-soon-cta">Stay Tuned</button>
    </div>
  );
}

export default ComingSoon;
