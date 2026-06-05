import { Search, SlidersHorizontal } from 'lucide-react';
import './SearchBar.css';

function SearchBar({ placeholder = 'Search...', value, onChange, onFilterClick }) {
  return (
    <div className="search-bar">
      <input
        type="text"
        className={`search-bar-input${onFilterClick ? ' has-filter' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-label={placeholder}
      />
      <Search className="search-bar-icon" size={18} />
      {onFilterClick && (
        <button
          className="search-bar-filter"
          onClick={onFilterClick}
          aria-label="Open filters"
        >
          <SlidersHorizontal size={18} />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
