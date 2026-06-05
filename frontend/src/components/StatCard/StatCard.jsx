import './StatCard.css';

function StatCard({ icon, value, label, color = 'purple' }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className={`stat-card-icon icon-${color}`}>
        {icon}
      </div>
      <span className="stat-card-value">{value}</span>
      <span className="stat-card-label">{label}</span>
    </div>
  );
}

export default StatCard;
