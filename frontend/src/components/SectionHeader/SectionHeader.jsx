import './SectionHeader.css';

function SectionHeader({ title, actionText = 'See All', onAction }) {
  return (
    <div className="section-header">
      <h3 className="section-header-title">{title}</h3>
      {onAction && (
        <button className="section-header-action" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
}

export default SectionHeader;
