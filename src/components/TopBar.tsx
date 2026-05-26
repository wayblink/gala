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
  // Similar Review mode: center hosts the group-window slider; the
  // overall banner layout stays stable (title | center | aux/search).
  similarReviewMode?: boolean
  windowMs?: number
  windowMsMin?: number
  windowMsMax?: number
  onWindowChange?: (next: number) => void
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

function formatWindow(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`
  return `${Math.round(ms / 60_000)} min`
}

export function TopBar({
  searchQuery,
  onSearchChange,
  displayMode,
  onDisplayModeChange,
  filterActive = false,
  onToggleFilter,
  selectionMode = false,
  onToggleSelectionMode,
  similarReviewMode = false,
  windowMs = 30_000,
  windowMsMin = 1_000,
  windowMsMax = 300_000,
  onWindowChange,
}: TopBarProps) {
  const selectButton = (
    <button
      className={`icon-button${selectionMode ? ' icon-button--active' : ''}`}
      aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
      aria-pressed={selectionMode}
      title={selectionMode ? 'Done selecting' : 'Select'}
      onClick={onToggleSelectionMode}
    >
      <CheckSquare size={16} />
    </button>
  )

  return (
    <header className={`top-bar${similarReviewMode ? ' top-bar--similar-review' : ''}`}>
      <div className="top-bar__brand">Memory Table</div>
      <div className="top-bar__center">
        {similarReviewMode ? (
          <label className="sr-banner-slider" aria-label="Group window">
            <span className="sr-banner-slider__label">Group window</span>
            <input
              type="range"
              min={windowMsMin}
              max={windowMsMax}
              step={1_000}
              value={Math.max(windowMsMin, Math.min(windowMsMax, windowMs))}
              onChange={(event) => onWindowChange?.(Number.parseInt(event.target.value, 10))}
              aria-label="Group window in milliseconds"
            />
            <span className="sr-banner-slider__value">{formatWindow(windowMs)}</span>
          </label>
        ) : (
          <>
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
            {selectButton}
          </>
        )}
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
        {similarReviewMode ? (
          selectButton
        ) : (
          <button
            className={`icon-button${filterActive ? ' icon-button--active' : ''}`}
            aria-label="Open filters"
            aria-pressed={filterActive}
            title="Smart filters"
            onClick={onToggleFilter}
          >
            <Filter size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
