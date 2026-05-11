import { CheckSquare, Filter, GalleryHorizontal, Grid3X3, Rows3, Search } from 'lucide-react'
import type { PhotoDisplayMode } from '../types/photos'

type TopBarProps = {
  searchQuery: string
  onSearchChange: (query: string) => void
  displayMode: PhotoDisplayMode
  onDisplayModeChange: (mode: PhotoDisplayMode) => void
  filterActive?: boolean
  onToggleFilter?: () => void
  selectionMode?: boolean
  onToggleSelectionMode?: () => void
}

const displayModes: Array<{
  mode: PhotoDisplayMode
  label: string
  icon: typeof Grid3X3
}> = [
  { mode: 'thumbnail', label: 'Thumbnail table', icon: Grid3X3 },
  { mode: 'list', label: 'List', icon: Rows3 },
  { mode: 'gallery', label: 'Gallery', icon: GalleryHorizontal },
]

export function TopBar({
  searchQuery,
  onSearchChange,
  displayMode,
  onDisplayModeChange,
  filterActive = false,
  onToggleFilter,
  selectionMode = false,
  onToggleSelectionMode,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">Memory Table</div>
      <div className="top-bar__center">
        <div className="view-mode-switcher" aria-label="Display mode">
          {displayModes.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              className={`icon-button${displayMode === mode ? ' icon-button--active' : ''}`}
              type="button"
              aria-label={label}
              aria-pressed={displayMode === mode}
              title={label}
              onClick={() => onDisplayModeChange(mode)}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        <button
          className={`icon-button${selectionMode ? ' icon-button--active' : ''}`}
          aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
          aria-pressed={selectionMode}
          title={selectionMode ? 'Done selecting' : 'Select'}
          onClick={onToggleSelectionMode}
        >
          <CheckSquare size={16} />
        </button>
      </div>
      <div className="top-bar__right">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search photos</span>
          <input
            placeholder="Search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <button
          className={`icon-button${filterActive ? ' icon-button--active' : ''}`}
          aria-label="Open filters"
          aria-pressed={filterActive}
          title="Smart filters"
          onClick={onToggleFilter}
        >
          <Filter size={16} />
        </button>
      </div>
    </header>
  )
}
