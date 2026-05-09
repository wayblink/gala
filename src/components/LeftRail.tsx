import { useState } from 'react'
import type { LibrarySummary, ScanProgress } from '../types/library'
import type { Album, PhotoFilter, SourceFolder } from '../types/photos'
import { StatusDot } from './StatusDot'

type RailItem = {
  label: string
  count?: string
  active?: boolean
  todo?: boolean
  onClick?: () => void
}

function NavGroup({ title, items }: { title: string; items: RailItem[] }) {
  return (
    <section className="rail-group">
      <h2>{title}</h2>
      <div className="rail-list">
        {items.map((item) => (
          <button
            className={`rail-item${item.active ? ' rail-item--active' : ''}${
              item.todo ? ' rail-item--todo' : ''
            }`}
            disabled={item.todo}
            key={item.label}
            type="button"
            onClick={item.onClick}
          >
            <span className="rail-item__label">{item.todo ? `${item.label} [todo]` : item.label}</span>
            {item.count ? <span className="rail-item__count">{item.count}</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}

const compactCount = (count: number) => {
  if (count >= 1000) {
    return `${Math.round(count / 1000)}k`
  }

  return String(count)
}

type LeftRailProps = {
  librarySummary: LibrarySummary
  isScanning: boolean
  scanProgress?: ScanProgress | null
  sourceFolders?: SourceFolder[]
  activeFilter?: PhotoFilter | null
  onSelectAllPhotos?: () => void
  onSelectRecent?: () => void
  onSelectFavorites?: () => void
  onSelectFolder?: (filter: PhotoFilter) => void
  onSelectHidden?: () => void
  albums?: Album[]
  onSelectAlbum?: (albumId: string) => void
  onCreateAlbum?: (name: string) => void
  onDeleteAlbum?: (albumId: string) => void
  onRenameAlbum?: (albumId: string, newName: string) => void
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
  const progressPercent =
    totalCount > 0 ? Math.min(100, Math.round((processedCount / totalCount) * 100)) : 0
  const currentFile = scanProgress?.currentFile
  const failedCount = scanProgress?.thumbnailFailedCount ?? 0
  const shouldShowScanSummary =
    !!scanProgress &&
    (isScanning || scanProgress.status === 'completed' || scanProgress.status === 'failed')
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
            <span className="scan-card__detail scan-card__detail--error">
              {scanProgress.errorMessage}
            </span>
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
  onSelectFolder = () => undefined,
  onSelectHidden = () => undefined,
  albums = [],
  onSelectAlbum = () => undefined,
  onCreateAlbum = () => undefined,
  onDeleteAlbum = () => undefined,
  onRenameAlbum = () => undefined,
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
  const viewItems: RailItem[] = [
    { label: 'People', todo: true },
    { label: 'Places', todo: true },
    { label: 'Memories', todo: true },
    { label: 'Similar', todo: true },
  ]

  return (
    <aside className="left-rail" aria-label="Photo navigation">
      <NavGroup title="Library" items={libraryItems} />
      <NavGroup title="Views" items={viewItems} />
      <section className="rail-group">
        <h2 className="rail-group__header-row">
          Albums
          <button
            className="rail-header-btn"
            title="New album"
            type="button"
            onClick={() => setShowNewAlbumInput(true)}
          >+</button>
        </h2>
        <div className="rail-list">
          {showNewAlbumInput && (
            <form
              className="rail-new-album"
              onSubmit={(e) => {
                e.preventDefault()
                const name = newAlbumName.trim()
                if (name) { onCreateAlbum(name); setNewAlbumName(''); setShowNewAlbumInput(false) }
              }}
            >
              <input
                autoFocus
                className="rail-album-input"
                placeholder="Album name"
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                onBlur={() => { if (!newAlbumName.trim()) setShowNewAlbumInput(false) }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewAlbumInput(false); setNewAlbumName('') } }}
              />
            </form>
          )}
          {albums.map((album) => (
            renamingAlbumId === album.id ? (
              <form
                className="rail-new-album"
                key={album.id}
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = renameValue.trim()
                  if (name) { onRenameAlbum(album.id, name) }
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
                  onKeyDown={(e) => { if (e.key === 'Escape') setRenamingAlbumId(null) }}
                />
              </form>
            ) : (
              <button
                className={`rail-item rail-item--album${activeFilter?.type === 'album' && activeFilter.albumId === album.id ? ' rail-item--active' : ''}`}
                key={album.id}
                type="button"
                onClick={() => onSelectAlbum(album.id)}
                onDoubleClick={() => { setRenamingAlbumId(album.id); setRenameValue(album.name) }}
              >
                <span className="rail-item__label">{album.name}</span>
                <span className="rail-item__count">{compactCount(album.photoCount)}</span>
                <button
                  className="rail-item__delete"
                  title="Delete album"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteAlbum(album.id) }}
                >×</button>
              </button>
            )
          ))}
          {albums.length === 0 && !showNewAlbumInput && (
            <div className="rail-item rail-item--muted"><span>No albums</span></div>
          )}
        </div>
      </section>
      <section className="rail-group">
        <h2>Sources</h2>
        <div className="rail-list">
          {sourceFolders.map((folder) => {
            const source = librarySummary.sources.find((item) => item.id === folder.sourceId)
            const isActive =
              activeSourceId === folder.sourceId && activeFolderPath === folder.folderPath

            return (
              <button
                aria-label={`${folder.name} ${compactCount(folder.photoCount)}`}
                className={`rail-item rail-item--source rail-item--folder${
                  isActive ? ' rail-item--active active' : ''
                } rail-item--${source?.status ?? 'online'}`}
                key={folder.id}
                style={{ paddingLeft: `${9 + folder.depth * 12}px` }}
                type="button"
                onClick={() =>
                  onSelectFolder({
                    type: 'folder',
                    sourceId: folder.sourceId,
                    folderPath: folder.folderPath,
                  })
                }
              >
                {folder.depth === 0 ? <StatusDot status={source?.status ?? 'online'} /> : null}
                <span className="rail-item__label">{folder.name}</span>
                <span className="rail-item__count">{compactCount(folder.photoCount)}</span>
              </button>
            )
          })}
          {sourceFolders.length === 0 &&
            librarySummary.sources.map((source) => (
              <button
                aria-label={`${source.name} ${compactCount(source.photoCount)}`}
                className={`rail-item rail-item--source rail-item--${source.status}`}
                key={source.id}
                type="button"
                onClick={() => onSelectFolder({ type: 'folder', sourceId: source.id, folderPath: '' })}
              >
                <StatusDot status={source.status} />
                <span className="rail-item__label">{source.name}</span>
                <span className="rail-item__count">{compactCount(source.photoCount)}</span>
              </button>
            ))}
          {librarySummary.sources.length === 0 && (
            <div className="rail-item rail-item--muted">
              <span>No sources</span>
            </div>
          )}
        </div>
      </section>
      <ScanStatusCard
        librarySummary={librarySummary}
        isScanning={isScanning}
        scanProgress={scanProgress}
      />
    </aside>
  )
}
