import { useEffect, useState } from 'react'
import { useI18n } from '../state/useLocale'
import type { LibrarySummary, ScanProgress } from '../types/library'
import type { Album, ComingSoonViewId, PhotoFilter, SourceCollection, SourceFolder, Tag } from '../types/photos'

type RailItem = {
  label: string
  active?: boolean
  muted?: boolean
  onClick?: () => void
}

function Chevron({ expanded }: { expanded: boolean }) {
  return <span className="rail-chevron" aria-hidden="true">{expanded ? '⌄' : '›'}</span>
}

function NavGroup({ title, items, expanded, onToggle, action }: { title: string; items: RailItem[]; expanded: boolean; onToggle: () => void; action?: React.ReactNode }) {
  return (
    <section className="rail-group">
      <h2 className="rail-group__header-row">
        <button type="button" className="rail-group__collapse" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`} aria-expanded={expanded} onClick={onToggle}>
          <Chevron expanded={expanded} /><span>{title}</span>
        </button>
        {action}
      </h2>
      {expanded ? <div className="rail-list">
        {items.map((item) => (
          <button
            className={`rail-item${item.active ? ' rail-item--active' : ''}${item.muted ? ' rail-item--muted' : ''}`}
            key={item.label}
            type="button"
            onClick={item.onClick}
          >
            <span className="rail-item__label">{item.label}</span>
          </button>
        ))}
      </div> : null}
    </section>
  )
}

const NAV_STATE_KEY = 'gala:left-rail-sections'
type RailSection = 'library' | 'sources' | 'applePhotos' | 'applePhotosAlbums' | 'localFolders' | 'albums' | 'analysis'
type RailSections = Record<RailSection, boolean>
const DEFAULT_SECTIONS: RailSections = { library: true, sources: true, applePhotos: false, applePhotosAlbums: false, localFolders: false, albums: true, analysis: true }

function loadRailSections(): RailSections {
  if (typeof window.localStorage?.getItem !== 'function') return DEFAULT_SECTIONS
  try {
    const saved = JSON.parse(window.localStorage.getItem(NAV_STATE_KEY) ?? '{}') as Partial<RailSections>
    const migrated = { ...DEFAULT_SECTIONS, ...saved }
    // The previous persisted shape wrote Local Folders=true as an automatic
    // default. Treat records without the new Albums key as pre-migration so
    // existing installs receive the new collapsed defaults once.
    if (!Object.prototype.hasOwnProperty.call(saved, 'applePhotosAlbums')) {
      migrated.localFolders = false
      migrated.applePhotosAlbums = false
    }
    return migrated
  } catch {
    return DEFAULT_SECTIONS
  }
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
  onSelectSourceFavorites?: (sourceId: string, sourceName: string) => void
  sourceCollections?: SourceCollection[]
  onSelectSourceCollection?: (collection: SourceCollection) => void
  onSelectFolder?: (filter: PhotoFilter) => void
  onSelectSources?: () => void
  onAddSource?: () => void
  onRenameSource?: (sourceId: string, currentName: string) => void
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
  onSelectSourceFavorites = () => undefined,
  sourceCollections = [],
  onSelectSourceCollection = () => undefined,
  onSelectFolder = () => undefined,
  onSelectSources = () => undefined,
  onAddSource = () => undefined,
  onRenameSource = () => undefined,
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
  const applePhotosSources = librarySummary.sources.filter((source) => source.sourceKind === 'apple_photos')
  const localSources = librarySummary.sources.filter((source) => source.sourceKind !== 'apple_photos')
  const localSourceFolders = sourceFolders.filter((folder) => {
    const source = librarySummary.sources.find((item) => item.id === folder.sourceId)
    return source?.sourceKind !== 'apple_photos'
  })
  const [sections, setSections] = useState<RailSections>(loadRailSections)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false)
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (typeof window.localStorage?.setItem === 'function') {
      window.localStorage.setItem(NAV_STATE_KEY, JSON.stringify(sections))
    }
  }, [sections])

  const toggleSection = (section: RailSection) => {
    setSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const libraryItems: RailItem[] = [
    {
      label: t('nav.allPhotos'),
      active: activeFilter === null,
      onClick: onSelectAllPhotos,
    },
    {
      label: t('nav.recentlyAdded'),
      active: activeFilter?.type === 'recent',
      onClick: onSelectRecent,
    },
    {
      label: t('nav.favorites'),
      active: activeFilter?.type === 'favorites',
      onClick: onSelectFavorites,
    },
    {
      label: t('nav.hidden'),
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
          <NavGroup title={t('nav.library')} items={libraryItems} expanded={sections.library} onToggle={() => toggleSection('library')} />

          <section className="rail-group">
            <h2 className="rail-group__header-row">
              <div className="rail-group__heading-main">
                <button type="button" className="rail-group__collapse rail-group__collapse--icon-only" aria-label={`${sections.sources ? 'Collapse' : 'Expand'} ${t('nav.sources')}`} aria-expanded={sections.sources} onClick={() => toggleSection('sources')}>
                  <Chevron expanded={sections.sources} />
                </button>
                <button
                  className={`rail-group__title-btn${activeFilter?.type === 'sources' ? ' rail-group__title-btn--active' : ''}`}
                  type="button"
                  onClick={onSelectSources}
                >
                  {t('nav.sources')}
                </button>
              </div>
              <button
                className="rail-header-btn"
                aria-label={t('sources.add')}
                title="Add source"
                type="button"
                onClick={onAddSource}
              >
                +
              </button>
            </h2>
            {sections.sources ? <div className="rail-list rail-list--sources">
              {applePhotosSources.map((source) => (
                <div className="rail-source-provider" key={source.id}>
                  <div className="rail-source-provider__heading">
                    <button type="button" className="rail-source-provider__collapse" aria-label={`${sections.applePhotos ? 'Collapse' : 'Expand'} ${source.name}`} aria-expanded={sections.applePhotos} onClick={() => toggleSection('applePhotos')}>
                      <Chevron expanded={sections.applePhotos} /><span>{source.name}</span>
                    </button>
                  </div>
                  {sections.applePhotos ? <>
                    <button
                      className={`rail-item rail-item--provider-child${activeSourceId === source.id && activeFolderPath === '' ? ' rail-item--active' : ''}`}
                      type="button"
                      onClick={() => onSelectFolder({ type: 'folder', sourceId: source.id, folderPath: '' })}
                    >
                      <span className="rail-item__label">{t('nav.allPhotos')}</span>
                    </button>
                    {sourceCollections.length > 0 ? (
                      <button
                        type="button"
                        className={`rail-item rail-item--provider-child rail-item--provider-toggle${sections.applePhotosAlbums ? ' rail-item--provider-toggle-expanded' : ''}`}
                        aria-label={`${sections.applePhotosAlbums ? 'Collapse' : 'Expand'} ${t('nav.albums')}`}
                        aria-expanded={sections.applePhotosAlbums}
                        onClick={() => toggleSection('applePhotosAlbums')}
                      >
                        <span className="rail-item__tree-toggle"><Chevron expanded={sections.applePhotosAlbums} /></span>
                        <span className="rail-item__label">{t('nav.albums')}</span>
                      </button>
                    ) : null}
                    {sections.applePhotosAlbums ? sourceCollections.map((collection) => (
                      <button
                        key={collection.id}
                        className={`rail-item rail-item--provider-collection${activeFilter?.type === 'source-collection' && activeFilter.collectionId === collection.id ? ' rail-item--active' : ''}`}
                        type="button"
                        onClick={() => onSelectSourceCollection(collection)}
                      >
                        <span className="rail-item__label">{collection.name}</span>
                      </button>
                    )) : null}
                    <button
                      className={`rail-item rail-item--provider-child${activeFilter?.type === 'source-favorites' && activeFilter.sourceId === source.id ? ' rail-item--active' : ''}`}
                      type="button"
                      onClick={() => onSelectSourceFavorites(source.id, source.name)}
                    >
                      <span className="rail-item__label">{t('nav.favorites')}</span>
                    </button>
                  </> : null}
                </div>
              ))}
              {localSources.length > 0 ? (
                <div className="rail-source-provider rail-source-provider--local">
                  <div className="rail-source-provider__heading">
                    <button type="button" className="rail-source-provider__collapse" aria-label={`${sections.localFolders ? 'Collapse' : 'Expand'} ${t('sources.localFolders')}`} aria-expanded={sections.localFolders} onClick={() => toggleSection('localFolders')}>
                      <Chevron expanded={sections.localFolders} /><span>{t('sources.localFolders')}</span>
                    </button>
                  </div>
                  {sections.localFolders ? localSourceFolders.map((folder) => {
                const source = librarySummary.sources.find((item) => item.id === folder.sourceId)
                const isActive = activeSourceId === folder.sourceId && activeFolderPath === folder.folderPath
                const isRoot = folder.depth === 0
                return (
                  <div
                    key={folder.id}
                    className={`rail-item rail-item--source rail-item--folder${
                      isActive ? ' rail-item--active active' : ''
                    } rail-item--${source?.status ?? 'online'}${isRoot ? ' rail-item--source-root' : ''}`}
                    style={{ paddingLeft: `${34 + folder.depth * 12}px` }}
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
                    </button>
                    {isRoot && source?.sourceKind !== 'apple_photos' ? (
                      <button
                        className="rail-item__rename"
                        title={t('sources.edit')}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRenameSource(folder.sourceId, folder.name)
                        }}
                      >
                        ✎
                      </button>
                    ) : null}
                    {isRoot ? (
                      <button
                        className="rail-item__delete"
                        title="Remove source"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSource(folder.sourceId)
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                )
                  }) : null}
                  {sections.localFolders && localSourceFolders.length === 0 &&
                    localSources.map((source) => (
                  <div
                    key={source.id}
                    className={`rail-item rail-item--source rail-item--source-root rail-item--provider-child rail-item--${source.status}`}
                  >
                    <button
                      aria-label={`${source.name} ${compactCount(source.photoCount)}`}
                      type="button"
                      className="rail-item__main"
                      onClick={() => onSelectFolder({ type: 'folder', sourceId: source.id, folderPath: '' })}
                    >
                      <span className="rail-item__label">{source.name}</span>
                    </button>
                    {source.sourceKind !== 'apple_photos' ? (
                      <button
                        className="rail-item__rename"
                        title={t('sources.edit')}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRenameSource(source.id, source.name)
                        }}
                      >
                        ✎
                      </button>
                    ) : null}
                    <button
                      className="rail-item__delete"
                      title="Remove source"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSource(source.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                    ))}
                </div>
              ) : null}
              {librarySummary.sources.length === 0 && (
                <div className="rail-item rail-item--muted">
                  <span>{t('nav.noSources')}</span>
                </div>
              )}
            </div> : null}
          </section>

          <section className="rail-group">
            <h2 className="rail-group__header-row">
              <button type="button" className="rail-group__collapse" aria-label={`${sections.albums ? 'Collapse' : 'Expand'} ${t('nav.albums')}`} aria-expanded={sections.albums} onClick={() => toggleSection('albums')}>
                <Chevron expanded={sections.albums} /><span>{t('nav.albums')}</span>
              </button>
              <button
                aria-label={t('nav.newAlbum')}
                className="rail-header-btn"
                title={t('nav.newAlbum')}
                type="button"
                onClick={() => setShowNewAlbumInput(true)}
              >
                +
              </button>
            </h2>
            {sections.albums ? <div className="rail-list">
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
            </div> : null}
          </section>

          <NavGroup
            title={t('nav.galaAnalysis')}
            items={[...exploreItems, ...arrangeItems]}
            expanded={sections.analysis}
            onToggle={() => toggleSection('analysis')}
          />

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
