import { useState } from 'react'
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
  const activeSourceId = activeFilter?.type === 'folder' ? activeFilter.sourceId : null
  const activeFolderPath = activeFilter?.type === 'folder' ? activeFilter.folderPath : null
  const [newAlbumName, setNewAlbumName] = useState('')
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false)
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const libraryItems: RailItem[] = [
    {
      label: 'All Photos',
      count: compactCount(librarySummary.totalPhotos),
      active: activeFilter === null,
      onClick: onSelectAllPhotos,
    },
    {
      label: 'Recently Added',
      count: compactCount(librarySummary.recentlyAddedCount),
      active: activeFilter?.type === 'recent',
      onClick: onSelectRecent,
    },
    {
      label: 'Favorites',
      count: compactCount(librarySummary.favoritesCount),
      active: activeFilter?.type === 'favorites',
      onClick: onSelectFavorites,
    },
    {
      label: 'Hidden',
      count: librarySummary.hiddenCount > 0 ? compactCount(librarySummary.hiddenCount) : undefined,
      active: activeFilter?.type === 'hidden',
      onClick: onSelectHidden,
    },
  ]

  const viewItems: Array<{ id: ComingSoonViewId; label: string }> = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'places', label: 'Places' },
    { id: 'people', label: 'People' },
    { id: 'memories', label: 'Memories' },
    { id: 'similar', label: 'Similar' },
  ]
  const viewRailItems: RailItem[] = viewItems.map((v) => ({
    label: v.label,
    active: activeFilter?.type === 'view' && activeFilter.viewId === v.id,
    onClick: () => onSelectView(v.id),
  }))

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
          <NavGroup title="Library" items={libraryItems} />

          <section className="rail-group">
            <h2>Views</h2>
            <div className="rail-list">
              {viewRailItems.map((item) => (
                <button
                  className={`rail-item${item.active ? ' rail-item--active' : ''}`}
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                >
                  <span className="rail-item__label">{item.label}</span>
                </button>
              ))}
            </div>
            {tags.length > 0 && (
              <>
                <div className="rail-sub-label">Tags</div>
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
              </>
            )}
          </section>

          <section className="rail-group">
            <h2 className="rail-group__header-row">
              Sources
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
                  <span>No sources</span>
                </div>
              )}
            </div>
          </section>

          <section className="rail-group">
            <h2 className="rail-group__header-row">
              Albums
              <button
                className="rail-header-btn"
                title="New album"
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

          <section className="rail-group">
            <h2>Explore</h2>
            <div className="rail-list">
              <button
                className={`rail-item${activeFilter?.type === 'explore' ? ' rail-item--active' : ''}`}
                type="button"
                onClick={onSelectExplore}
              >
                <span className="rail-item__label">Discover</span>
              </button>
            </div>
          </section>

          <section className="rail-group">
            <h2>Settings</h2>
            <div className="rail-list">
              <button
                className={`rail-item${activeFilter?.type === 'settings' ? ' rail-item--active' : ''}`}
                type="button"
                onClick={onSelectSettings}
              >
                <span className="rail-item__label">Preferences</span>
              </button>
            </div>
          </section>

          {(isScanning || scanProgress?.status === 'failed') && (
            <ScanStatusCard librarySummary={librarySummary} isScanning={isScanning} scanProgress={scanProgress} />
          )}
        </div>
      )}
    </aside>
  )
}
