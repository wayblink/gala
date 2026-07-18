import { Aperture, CheckSquare, Filter, GalleryHorizontal, Grid3X3, Rows3, Search } from 'lucide-react'
import { useI18n } from '../state/useLocale'
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
  labelKey: string
  icon: typeof Grid3X3
}> = [
  { mode: 'thumbnail', labelKey: 'top.thumbnailTable', icon: Grid3X3 },
  { mode: 'list', labelKey: 'top.list', icon: Rows3 },
  { mode: 'gallery', labelKey: 'top.gallery', icon: GalleryHorizontal },
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
  const { t } = useI18n()
  const selectButton = (
    <button
      className={`icon-button${selectionMode ? ' icon-button--active' : ''}`}
      aria-label={selectionMode ? t('top.exitSelection') : t('top.enterSelection')}
      aria-pressed={selectionMode}
      title={selectionMode ? t('top.doneSelecting') : t('top.select')}
      onClick={onToggleSelectionMode}
    >
      <CheckSquare size={16} />
    </button>
  )

  return (
    <header className={`top-bar${similarReviewMode ? ' top-bar--similar-review' : ''}`}>
      <div className="top-bar__brand" aria-label={t('app.brand')}>
        <span className="top-bar__brand-mark" aria-hidden="true">
          <Aperture size={18} strokeWidth={1.8} />
        </span>
        <span className="top-bar__wordmark">{t('app.brand')}</span>
      </div>
      <div className="top-bar__center">
        {similarReviewMode ? (
          <label className="sr-banner-slider" aria-label={t('top.groupWindow')}>
            <span className="sr-banner-slider__label">{t('top.groupWindow')}</span>
            <input
              type="range"
              min={windowMsMin}
              max={windowMsMax}
              step={1_000}
              value={Math.max(windowMsMin, Math.min(windowMsMax, windowMs))}
              onChange={(event) => onWindowChange?.(Number.parseInt(event.target.value, 10))}
              aria-label={t('top.groupWindow')}
            />
            <span className="sr-banner-slider__value">{formatWindow(windowMs)}</span>
          </label>
        ) : (
          <>
            <div className="view-mode-switcher" aria-label={t('top.displayMode')}>
              {displayModes.map(({ mode, labelKey, icon: Icon }) => (
                <button
                  key={mode}
                  className={`icon-button${displayMode === mode ? ' icon-button--active' : ''}`}
                  type="button"
                  aria-label={t(labelKey)}
                  aria-pressed={displayMode === mode}
                  title={t(labelKey)}
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
        {!similarReviewMode && (
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">{t('top.searchPhotos')}</span>
            <input
              placeholder={t('top.search')}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        )}
        {similarReviewMode ? (
          selectButton
        ) : (
          <button
            className={`icon-button${filterActive ? ' icon-button--active' : ''}`}
            aria-label={t('top.openFilters')}
            aria-pressed={filterActive}
            title={t('top.smartFilters')}
            onClick={onToggleFilter}
          >
            <Filter size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
