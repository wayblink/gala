import { useState } from 'react'
import { useI18n } from '../state/useLocale'
import type { LibrarySummary, ScanProgress } from '../types/library'
import type { Album, ComingSoonViewId, PhotoFilter, SourceFolder, Tag } from '../types/photos'

type RailItem = {
  label: string
  count?: string
  active?: boolean
  muted?: boolean
  onClick?: () => void
}

function NavGroup({ title, items, action }: { title: string; items: RailItem[]; action?: React.ReactNode }) {
  return (
    <section className="rail-group">
      <h2 className={action ? 'rail-group__header-row' : undefined}>
        {title}
        {action}
      </h2>
      <div className="rail-list">
        {items.map((item) => (
          <button
            className={`rail-item${item.active ? ' rail-item--active' : ''}${item.muted ? ' rail-item--muted' : ''}`}
            key={item.label}
            type="button"
            onClick={item.onClick}
          >
            <span className="rail-item__label">{item.label}</span>
            {item.count ? <span className="rail-item__count">{item.count}</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}

const compactCount = (count: number) => (count >= 1000 ? `${Math.round(count / 1000)}k` : String(count))

type LeftRailProps = {
  librarySummary: LibrarySummary
  isScanning: boolean
  scanProgress?: ScanProgress | null
  sourceFolders?: SourceFolder[]
  activeFilter?: PhotoFilter | null
  onSelectAllPhotos?: () => void
  onSelectRecent?: () => void
  onSelectFavorites?: () => void
  onSelectHidden?: () => void
  onSelectFolder?: (filter: PhotoFilter) => void
  onAddSource?: () => void
  onDeleteSource?: (sourceId: string) => void
  onSelectView?: (viewId: ComingSoonViewId) => void
  onSelectExplore?: () => void
  onSelectSettings?: () => void
  onSelectTasks?: () => void
  activeTaskCount?: number
  albums?: Album[]
  onSelectAlbum?: (albumId: string) => void
  onCreateAlbum?: (name: string) => void
  onDeleteAlbum?: (albumId: string) => void
  onRenameAlbum?: (albumId: string, newName: string) => void
  tags?: Tag[]
  onSelectTag?: (tagName: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const scanProcessedCount = (scanProgress: ScanProgress) =>
  scanProgress.thumbnailReadyCount + scanProgress.thumbnailFailedCount

function ScanStatusCard({
  librarySummary,
  isScanning,
  scanProgress,
}: {
  librarySummary: LibrarySummary
  isScanning: boolean
  scanProgress?: ScanProgress | null
}) {
  const processedCount = scanProgress ? scanProcessedCount(scanProgress) : 0
  const totalCount = scanProgress?.discoveredCount ?? 0
  const progressPercent = totalCount > 0 ? Math.min(100, Math.round((processedCount / totalCount) * 100)) : 0
  const currentFile = scanProgress?.currentFile
  const failedCount = scanProgress?.thumbnailFailedCount ?? 0
  const shouldShowScanSummary =
    !!scanProgress && (isScanning || scanProgress.status === 'completed' || scanProgress.status === 'failed')
  const statusLabel =
    scanProgress?.status === 'completed'
      ? 'Scan Complete'
      : scanProgress?.status === 'failed'
        ? 'Scan Failed'
        : isScanning
          ? 'Scanning'
          : 'Library Status'

  return (
    <section className="scan-card" aria-label="Scan status">
      <span>{statusLabel}</span>
      <div className="scan-card__bar" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      {shouldShowScanSummary ? (
        <>
          <strong>
            {processedCount.toLocaleString()} / {totalCount.toLocaleString()} processed
          </strong>
          {currentFile ? <span className="scan-card__detail">{currentFile}</span> : null}
          {failedCount > 0 ? <span className="scan-card__detail">{failedCount} failed</span> : null}
          {scanProgress.errorMessage ? (
            <span className="scan-card__detail scan-card__detail--error">{scanProgress.errorMessage}</span>
          ) : null}
        </>
      ) : (
        <strong>{librarySummary.totalPhotos.toLocaleString()} indexed</strong>
      )}
    </section>
  )
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7.5h14M5 12h10M5 16.5h7" />
      <path d="M17.5 13.5l1.5 1.5 3-3" />
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
      <path d="M19.4 13.4c.1-.46.1-.94 0-1.4l2-1.55-2-3.46-2.5 1a7.6 7.6 0 0 0-1.2-.7L15.3 4h-4l-.4 3.3c-.42.18-.82.42-1.2.7l-2.5-1-2 3.46 2 1.55a7 7 0 0 0 0 1.4l-2 1.55 2 3.46 2.5-1c.38.28.78.52 1.2.7l.4 3.3h4l.4-3.3c.42-.18.82-.42 1.2-.7l2.5 1 2-3.46-2-1.55Z" />
    </svg>
  )
}

export function LeftRail({
  librarySummary,
  isScanning,
  scanProgress,
  sourceFolders = [],
  activeFilter = null,
  onSelectAllPhotos = () => undefined,
  onSelectRecent = () => undefined,
  onSelectFavorites = () => undefined,
  onSelectHidden = () => undefined,
  onSelectFolder = () => undefined,
  onAddSource = () => undefined,
  onDeleteSource = () => undefined,
  onSelectView = () => undefined,
  onSelectExplore = () => undefined,
  onSelectSettings = () => undefined,
  onSelectTasks = () => undefined,
  activeTaskCount = 0,
  albums = [],
  onSelectAlbum = () => undefined,
  onCreateAlbum = () => undefined,
  onDeleteAlbum = () => undefined,
  onRenameAlbum = () => undefined,
  tags = [],
  onSelectTag = () => undefined,
  collapsed = false,
  onToggleCollapse = () => undefined,
}: LeftRailProps) {
  const { t } = useI18n()
  const activeSourceId = activeFilter?.type === 'folder' ? activeFilter.sourceId : null
  const activeFolderPath = activeFilter?.type === 'folder' ? activeFilter.folderPath : null
  const [newAlbumName, setNewAlbumName] = useState('')
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false)
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const libraryItems: RailItem[] = [
    {
      label: t('nav.allPhotos'),
      count: compactCount(librarySummary.totalPhotos),
      active: activeFilter === null,
      onClick: onSelectAllPhotos,
    },
    {
      label: t('nav.recentlyAdded'),
      count: compactCount(librarySummary.recentlyAddedCount),
      active: activeFilter?.type === 'recent',
      onClick: onSelectRecent,
    },
    {
      label: t('nav.favorites'),
      count: compactCount(librarySummary.favoritesCount),
      active: activeFilter?.type === 'favorites',
      onClick: onSelectFavorites,
    },
    {
      label: t('nav.hidden'),
      count: librarySummary.hiddenCount > 0 ? compactCount(librarySummary.hiddenCount) : undefined,
      active: activeFilter?.type === 'hidden',
      onClick: onSelectHidden,
    },
  ]

  const buildSurfaceItem = (id: ComingSoonViewId, label: string): RailItem => ({
    label,
    active: activeFilter?.type === 'view' && activeFilter.viewId === id,
    onClick: () => onSelectView(id),
  })

  const exploreItems: RailItem[] = [
    buildSurfaceItem('people', t('nav.people')),
    buildSurfaceItem('content', t('nav.content')),
    {
      label: t('nav.labels'),
      active: activeFilter?.type === 'explore',
      onClick: onSelectExplore,
    },
  ]

  const arrangeItems: RailItem[] = [
    buildSurfaceItem('similar', t('nav.similarReview')),
    buildSurfaceItem('reorganize', t('nav.reorganize')),
  ]

  return (
    <aside className={`left-rail${collapsed ? ' left-rail--collapsed' : ''}`} aria-label="Photo navigation">
      <button
        className="rail-collapse-btn"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      {!collapsed && (
        <div className="left-rail__scroll">
          <NavGroup title={t('nav.library')}  items={libraryItems} />

          <NavGroup title={t('nav.explore')}  items={exploreItems} />

          <NavGroup title={t('nav.arrange')}  items={arrangeItems} />

          <section className="rail-group">
            <h2 className="rail-group__header-row">
              {t('nav.sources')}
              <button
                className="rail-header-btn"
                title="Add source"
                type="button"
                onClick={onAddSource}
              >
                +
              </button>
            </h2>
            <div className="rail-list">
              {sourceFolders.map((folder) => {
                const source = librarySummary.sources.find((item) => item.id === folder.sourceId)
                const isActive = activeSourceId === folder.sourceId && activeFolderPath === folder.folderPath
                const isRoot = folder.depth === 0
                return (
                  <div
                    key={folder.id}
                    className={`rail-item rail-item--source rail-item--folder${
                      isActive ? ' rail-item--active active' : ''
                    } rail-item--${source?.status ?? 'online'}${isRoot ? ' rail-item--source-root' : ''}`}
                    style={{ paddingLeft: `${9 + folder.depth * 12}px` }}
                  >
                    <button
                      aria-label={`${folder.name} ${compactCount(folder.photoCount)}`}
                      type="button"
                      className="rail-item__main"
                      onClick={() =>
                        onSelectFolder({
                          type: 'folder',
                          sourceId: folder.sourceId,
                          folderPath: folder.folderPath,
                        })
                      }
                    >
                      <span className="rail-item__label">{folder.name}</span>
                      <span className="rail-item__count">{compactCount(folder.photoCount)}</span>
                    </button>
                    {isRoot ? (
                      <button
                        className="rail-item__delete"
                        title="Remove source"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (
                            window.confirm(
                              `Remove source "${folder.name}"? This deletes all its photos, thumbnails, and album links from Gala. Your original files on disk are not touched.`,
                            )
                          ) {
                            onDeleteSource(folder.sourceId)
                          }
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                )
              })}
              {sourceFolders.length === 0 &&
                librarySummary.sources.map((source) => (
                  <div
                    key={source.id}
                    className={`rail-item rail-item--source rail-item--source-root rail-item--${source.status}`}
                  >
                    <button
                      aria-label={`${source.name} ${compactCount(source.photoCount)}`}
                      type="button"
                      className="rail-item__main"
                      onClick={() => onSelectFolder({ type: 'folder', sourceId: source.id, folderPath: '' })}
                    >
                      <span className="rail-item__label">{source.name}</span>
                      <span className="rail-item__count">{compactCount(source.photoCount)}</span>
                    </button>
                    <button
                      className="rail-item__delete"
                      title="Remove source"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (
                          window.confirm(
                            `Remove source "${source.name}"? This deletes all its photos, thumbnails, and album links from Gala. Your original files on disk are not touched.`,
                          )
                        ) {
                          onDeleteSource(source.id)
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              {librarySummary.sources.length === 0 && (
                <div className="rail-item rail-item--muted">
                  <span>{t('nav.noSources')}</span>
                </div>
              )}
            </div>
          </section>

          <section className="rail-group">
            <h2 className="rail-group__header-row">
              {t('nav.albums')}
              <button
                className="rail-header-btn"
                title={t('nav.newAlbum')}
                type="button"
                onClick={() => setShowNewAlbumInput(true)}
              >
                +
              </button>
            </h2>
            <div className="rail-list">
              {showNewAlbumInput && (
                <form
                  className="rail-new-album"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = newAlbumName.trim()
                    if (name) {
                      onCreateAlbum(name)
                      setNewAlbumName('')
                      setShowNewAlbumInput(false)
                    }
                  }}
                >
                  <input
                    autoFocus
                    className="rail-album-input"
                    placeholder="Album name"
                    type="text"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    onBlur={() => {
                      if (!newAlbumName.trim()) setShowNewAlbumInput(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowNewAlbumInput(false)
                        setNewAlbumName('')
                      }
                    }}
                  />
                </form>
              )}
              {albums.map((album) =>
                renamingAlbumId === album.id ? (
                  <form
                    className="rail-new-album"
                    key={album.id}
                    onSubmit={(e) => {
                      e.preventDefault()
                      const name = renameValue.trim()
                      if (name) onRenameAlbum(album.id, name)
                      setRenamingAlbumId(null)
                    }}
                  >
                    <input
                      autoFocus
                      className="rail-album-input"
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => setRenamingAlbumId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenamingAlbumId(null)
                      }}
                    />
                  </form>
                ) : (
                  <div
                    className={`rail-item rail-item--album${
                      activeFilter?.type === 'album' && activeFilter.albumId === album.id ? ' rail-item--active' : ''
                    }`}
                    key={album.id}
                  >
                    <button
                      type="button"
                      className="rail-item__main"
                      onClick={() => onSelectAlbum(album.id)}
                      onDoubleClick={() => {
                        setRenamingAlbumId(album.id)
                        setRenameValue(album.name)
                      }}
                    >
                      <span className="rail-item__label">{album.name}</span>
                      <span className="rail-item__count">{compactCount(album.photoCount)}</span>
                    </button>
                    <button
                      className="rail-item__rename"
                      title="Rename album"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenamingAlbumId(album.id)
                        setRenameValue(album.name)
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="rail-item__delete"
                      title="Delete album"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`Delete album "${album.name}"? Photos in the album are not deleted.`)) {
                          onDeleteAlbum(album.id)
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                ),
              )}
              {albums.length === 0 && !showNewAlbumInput && (
                <div className="rail-item rail-item--muted">
                  <span>No albums</span>
                </div>
              )}
            </div>
          </section>

          {tags.length > 0 && (
            <section className="rail-group">
              <h2>{t('nav.tags')}</h2>
              <div className="rail-list">
                {tags.map((tag) => (
                  <button
                    className={`rail-item rail-item--tag${
                      activeFilter?.type === 'tag' && activeFilter.tagName === tag.name
                        ? ' rail-item--active'
                        : ''
                    }`}
                    key={tag.name}
                    type="button"
                    onClick={() => onSelectTag(tag.name)}
                  >
                    <span className="rail-item__tag-dot" aria-hidden="true" />
                    <span className="rail-item__label">{tag.name}</span>
                    <span className="rail-item__count">{compactCount(tag.photoCount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(isScanning || scanProgress?.status === 'failed') && (
            <ScanStatusCard librarySummary={librarySummary} isScanning={isScanning} scanProgress={scanProgress} />
          )}
        </div>
      )}
      {!collapsed && (
        <div className="left-rail__utility" aria-label="Utility navigation">
          <button
            className={`rail-utility-btn${activeFilter?.type === 'tasks' ? ' rail-utility-btn--active' : ''}`}
            type="button"
            title={t('nav.backgroundTasks')}
            aria-label={t('nav.backgroundTasks')}
            onClick={onSelectTasks}
          >
            <TasksIcon />
            {activeTaskCount > 0 ? <span className="rail-utility-btn__badge">{compactCount(activeTaskCount)}</span> : null}
          </button>
          <button
            className={`rail-utility-btn${activeFilter?.type === 'settings' ? ' rail-utility-btn--active' : ''}`}
            type="button"
            title={t('nav.settings')}
            aria-label={t('nav.settings')}
            onClick={onSelectSettings}
          >
            <SettingsIcon />
          </button>
        </div>
      )}
    </aside>
  )
}
