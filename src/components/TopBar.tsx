import { Filter, FolderPlus, GalleryHorizontal, Grid3X3, Rows3, Search } from 'lucide-react'
import type { PhotoDisplayMode } from '../types/photos'

type TopBarProps = {
  onAddFolder: () => void
  isScanning: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  displayMode: PhotoDisplayMode
  onDisplayModeChange: (mode: PhotoDisplayMode) => void
  filterActive?: boolean
  onToggleFilter?: () => void
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
  onAddFolder,
  isScanning,
  searchQuery,
  onSearchChange,
  displayMode,
  onDisplayModeChange,
  filterActive = false,
  onToggleFilter,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">Memory Table</div>
      <div className="top-bar__actions">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search photos</span>
          <input
            placeholder="Search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
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
          className={`icon-button${filterActive ? ' icon-button--active' : ''}`}
          aria-label="Open filters"
          aria-pressed={filterActive}
          title="Smart filters"
          onClick={onToggleFilter}
        >
          <Filter size={16} />
        </button>
        <button className="primary-button" onClick={onAddFolder} disabled={isScanning}>
          <FolderPlus size={16} />
          {isScanning ? 'Scanning...' : 'Add Folder'}
        </button>
      </div>
    </header>
  )
}
