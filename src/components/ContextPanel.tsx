import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { computePhotoQualityScore } from '../domain/photoQuality'
import type { LibrarySource, LibrarySummary } from '../types/library'
import type { SelectionScope } from '../state/useSelection'
import type { Album, TimelinePhoto } from '../types/photos'

type ContextPanelProps = {
  librarySummary: LibrarySummary
  selectedPhoto: TimelinePhoto | null
  activeSource?: LibrarySource | null
  editingSourceId?: string | null
  activeSourceActionId?: string | null
  isScanningSource?: boolean
  onToggleFavorite?: (photoId: string) => void
  onToggleHidden?: (photoId: string) => void
  albums?: Album[]
  currentAlbumId?: string
  onAddToAlbum?: (albumId: string, photoId: string) => void
  onRemoveFromAlbum?: (albumId: string, photoId: string) => void
  onSetPhotoTags?: (photoId: string, tags: string[]) => Promise<void>
  onRevealInFinder?: (photoId: string) => Promise<void>
  onLoadApplePhotosOriginal?: (photoId: string) => Promise<string | null>
  onStartEditingSource?: (sourceId: string) => void
  onCancelEditingSource?: () => void
  onRenameSource?: (sourceId: string, newName: string) => Promise<void> | void
  onRelinkSource?: (sourceId: string) => Promise<void> | void
  onRescanSource?: (sourceId: string) => Promise<void> | void
  onCreateAlbum?: (name: string) => Promise<Album | null> | void
  onDeleteSource?: (sourceId: string, sourceName: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  // Selection mode batch actions
  selectedIds?: Set<string>
  selectionScope?: SelectionScope | null
  onLoadApplePhotosOriginals?: (photoIds: string[]) => Promise<{ downloaded: number; failed: number; paths: Array<{ photoId: string; path: string }> }>
  onBatchFavorite?: (photoIds: string[], favorited: boolean) => Promise<void>
  onBatchHide?: (photoIds: string[], hidden: boolean) => Promise<void>
  onBatchAddTags?: (photoIds: string[], tags: string[]) => Promise<void>
  onBatchAddToAlbum?: (albumId: string, photoIds: string[]) => Promise<void>
  onBatchRemoveFromAlbum?: (albumId: string, photoIds: string[]) => Promise<void>
  // Similar Review mode: replaces the Library Index header section with a custom slot
  similarReviewMode?: boolean
  similarReviewInspector?: ReactNode
  showQuality?: boolean
  searchQuery?: string
  onSearchChange?: (query: string) => void
  filterActive?: boolean
  onToggleFilter?: () => void
}

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${bytes} B`
}

const formatDate = (value: string | null) => {
  if (!value) {
    return 'No date'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

const formatCamera = (photo: TimelinePhoto) => {
  const make = photo.cameraMake?.trim()
  const model = photo.cameraModel?.trim()

  if (make && model) {
    return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`
  }

  return make || model || 'Pending'
}

const formatGps = (latitude: number | null, longitude: number | null) => {
  if (latitude === null || longitude === null) {
    return 'Pending'
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

type AlbumDialogMode = 'single-add' | 'single-remove' | 'batch-add' | 'batch-remove'

export function ContextPanel({
  librarySummary,
  selectedPhoto,
  activeSource = null,
  editingSourceId = null,
  activeSourceActionId = null,
  isScanningSource = false,
  onToggleFavorite,
  onToggleHidden,
  albums = [],
  currentAlbumId,
  onAddToAlbum,
  onRemoveFromAlbum,
  onSetPhotoTags,
  onRevealInFinder,
  onLoadApplePhotosOriginal,
  onLoadApplePhotosOriginals,
  onStartEditingSource,
  onCancelEditingSource,
  onRenameSource,
  onRelinkSource,
  onRescanSource,
  onCreateAlbum,
  onDeleteSource,
  collapsed = false,
  onToggleCollapse = () => undefined,
  selectedIds,
  selectionScope = null,
  onBatchFavorite,
  onBatchHide,
  onBatchAddTags,
  onBatchAddToAlbum,
  onBatchRemoveFromAlbum,
  similarReviewMode = false,
  similarReviewInspector,
  showQuality = false,
  searchQuery = '',
  onSearchChange,
  filterActive = false,
  onToggleFilter,
}: ContextPanelProps) {
  const [albumDialogMode, setAlbumDialogMode] = useState<AlbumDialogMode | null>(null)
  const [albumDialogQuery, setAlbumDialogQuery] = useState('')
  const [albumDialogCreateName, setAlbumDialogCreateName] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [batchTagInput, setBatchTagInput] = useState('')
  const [sourceDraftName, setSourceDraftName] = useState('')
  const [originalLoadingPhotoId, setOriginalLoadingPhotoId] = useState<string | null>(null)
  const [originalStatus, setOriginalStatus] = useState<string | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const selectedCount = selectedIds?.size ?? 0
  const selectedIdList = Array.from(selectedIds ?? [])
  const selectedApplePhotoIds = selectedIdList.filter((id) => id.startsWith('apple-photos:'))
  const isBatchMode = selectedCount > 0
  const selectedPhotoQuality = showQuality && selectedPhoto ? computePhotoQualityScore(selectedPhoto) : null
  const isEditingSource = activeSource?.id === editingSourceId
  const isActiveSource = activeSource?.id === activeSourceActionId
  const isAlbumDialogOpen = albumDialogMode !== null
  const isRemoveAlbumDialog = albumDialogMode === 'single-remove' || albumDialogMode === 'batch-remove'
  const isBatchAlbumDialog = albumDialogMode === 'batch-add' || albumDialogMode === 'batch-remove'
  const albumDialogTitle = albumDialogMode === 'batch-add'
    ? 'Add all to Album'
    : albumDialogMode === 'batch-remove'
      ? 'Remove all from Album'
      : albumDialogMode === 'single-remove'
        ? 'Remove from Album'
        : 'Add to Album'
  const albumDialogAlbums = isRemoveAlbumDialog && currentAlbumId
    ? albums.filter((album) => album.id === currentAlbumId)
    : isRemoveAlbumDialog
      ? []
      : albums
  const filteredAlbums = albumDialogQuery.trim()
    ? albumDialogAlbums.filter((album) => album.name.toLowerCase().includes(albumDialogQuery.trim().toLowerCase()))
    : albumDialogAlbums

  const closeAlbumDialog = () => {
    setAlbumDialogMode(null)
    setAlbumDialogQuery('')
    setAlbumDialogCreateName('')
  }

  const openAlbumDialog = (mode: AlbumDialogMode) => {
    setAlbumDialogMode(mode)
    setAlbumDialogQuery('')
    setAlbumDialogCreateName('')
  }

  const applyAlbum = (albumId: string) => {
    if (!albumDialogMode) return
    if (isBatchAlbumDialog) {
      if (isRemoveAlbumDialog) {
        void onBatchRemoveFromAlbum?.(albumId, selectedIdList)
      } else {
        void onBatchAddToAlbum?.(albumId, selectedIdList)
      }
      closeAlbumDialog()
      return
    }

    if (selectedPhoto) {
      if (isRemoveAlbumDialog) {
        onRemoveFromAlbum?.(albumId, selectedPhoto.id)
      } else {
        onAddToAlbum?.(albumId, selectedPhoto.id)
      }
    }
    closeAlbumDialog()
  }

  const handleCreateAlbumInDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = albumDialogCreateName.trim()
    if (!name || !onCreateAlbum) return
    await onCreateAlbum(name)
    setAlbumDialogCreateName('')
    setAlbumDialogQuery(name)
  }

  useEffect(() => {
    if (!isAlbumDialogOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAlbumDialog()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAlbumDialogOpen])

  useEffect(() => {
    setOriginalStatus(null)
    setOriginalLoadingPhotoId(null)
  }, [selectedPhoto?.id])

  useEffect(() => {
    if (activeSource && isEditingSource) {
      setSourceDraftName(activeSource.name)
      return
    }

    if (!isEditingSource) {
      setSourceDraftName('')
    }
  }, [activeSource, isEditingSource])

  return (
    <aside className={`context-panel${collapsed ? ' context-panel--collapsed' : ''}`} aria-label="View context">
      <button
        className="panel-collapse-btn"
        title={collapsed ? 'Expand info panel' : 'Collapse info panel'}
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand info panel' : 'Collapse info panel'}
      >
        {collapsed ? '‹' : '›'}
      </button>
      {!collapsed && (
        <div className="context-panel__scroll">
      {!similarReviewMode && (
        <div className="context-panel__search">
          <label className="context-panel__search-field">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search photos…"
              aria-label="Search photos"
              value={searchQuery}
              onChange={(event) => onSearchChange?.(event.target.value)}
            />
          </label>
          <button
            className={`iconbtn${filterActive ? ' on' : ''}`}
            type="button"
            title="Filters"
            aria-label="Filters"
            aria-pressed={filterActive}
            onClick={onToggleFilter}
          >
            <SlidersHorizontal size={15} />
          </button>
        </div>
      )}
      {similarReviewMode ? (
        similarReviewInspector ?? (
          <section>
            <p className="eyebrow">Similar Review</p>
            <p className="mono-muted">Pick a group from the queue to inspect.</p>
          </section>
        )
      ) : null}
      {isBatchMode ? (
        <section className="cp-photo-section cp-batch-section">
          <div className="cp-photo-info">
            <p className="eyebrow">Batch Selection</p>
            <h3 className="cp-photo-name">{selectedCount} photos selected</h3>
            {selectionScope && 'label' in selectionScope ? <p className="cp-photo-date">{selectionScope.label}</p> : null}
          </div>

          <div className="cp-actions">
            {selectedApplePhotoIds.length > 0 && onLoadApplePhotosOriginals && (
              <button
                className="cp-action-btn"
                type="button"
                onClick={() => void onLoadApplePhotosOriginals(selectedApplePhotoIds)}
              >
                Load
              </button>
            )}
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchFavorite}
              onClick={() => void onBatchFavorite?.(selectedIdList, true)}
            >
              <Star size={14} strokeWidth={2} fill="currentColor" /> Favorite all
            </button>
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchFavorite}
              onClick={() => void onBatchFavorite?.(selectedIdList, false)}
            >
              <Star size={14} strokeWidth={2} /> Unfavorite
            </button>
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchHide}
              onClick={() => void onBatchHide?.(selectedIdList, true)}
            >
              <EyeOff size={14} strokeWidth={2} /> Hide all
            </button>
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchHide}
              onClick={() => void onBatchHide?.(selectedIdList, false)}
            >
              <Eye size={14} strokeWidth={2} /> Unhide
            </button>
            <div className="cp-album-picker">
              <button
                className="cp-action-btn"
                type="button"
                onClick={() => openAlbumDialog('batch-add')}
              >
                + Add all to Album
              </button>
            </div>
            {currentAlbumId ? (
              <div className="cp-album-picker">
                <button
                  className="cp-action-btn cp-action-btn--muted"
                  type="button"
                  onClick={() => openAlbumDialog('batch-remove')}
                >
                  - Remove all from Album
                </button>
              </div>
            ) : null}
          </div>

          <div className="photo-tags">
            <p className="eyebrow">Add tag to selection</p>
            <form
              className="photo-tags__row"
              onSubmit={(e) => {
                e.preventDefault()
                const tag = batchTagInput.trim()
                if (tag && onBatchAddTags) {
                  void onBatchAddTags(selectedIdList, [tag])
                }
                setBatchTagInput('')
              }}
            >
              <input
                className="photo-tags__input"
                placeholder="Tag all…"
                type="text"
                value={batchTagInput}
                onChange={(e) => setBatchTagInput(e.target.value)}
              />
            </form>
          </div>
        </section>
      ) : null}

      <section className="cp-photo-section">
        {activeSource ? (
          <div className={`cp-source-card${isActiveSource ? ' cp-source-card--active' : ''}`}>
            <div className="cp-source-card__header">
              <div>
                <p className="eyebrow">Current Source</p>
                {isEditingSource ? (
                  <form
                    className="cp-source-card__edit"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const trimmedDraft = sourceDraftName.trim()
                      if (!trimmedDraft || trimmedDraft === activeSource.name) {
                        return
                      }
                      void onRenameSource?.(activeSource.id, trimmedDraft)
                    }}
                  >
                    <label className="cp-source-card__label" htmlFor={`context-source-name-${activeSource.id}`}>
                      Source name
                    </label>
                    <input
                      autoFocus
                      className="cp-source-card__input"
                      id={`context-source-name-${activeSource.id}`}
                      type="text"
                      value={sourceDraftName}
                      onChange={(event) => setSourceDraftName(event.target.value)}
                    />
                    <div className="cp-source-card__actions cp-source-card__actions--editing">
                      <button type="submit" disabled={!sourceDraftName.trim() || sourceDraftName.trim() === activeSource.name}>
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceDraftName(activeSource.name)
                          onCancelEditingSource?.()
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h3 className="cp-source-card__name">{activeSource.name}</h3>
                    <p className="cp-source-card__count">{activeSource.photoCount} photos</p>
                  </>
                )}
              </div>
              {!isEditingSource ? <p className="cp-source-card__status">{activeSource.status}</p> : null}
            </div>

            {!isEditingSource ? (
              <div className="cp-source-card__actions">
                <button type="button" onClick={() => {
                  setSourceDraftName(activeSource.name)
                  onStartEditingSource?.(activeSource.id)
                }}>
                  Edit
                </button>
                <button type="button" onClick={() => void onRelinkSource?.(activeSource.id)}>
                  Relink path
                </button>
                <button type="button" disabled={isScanningSource || activeSource.status !== 'online'} onClick={() => void onRescanSource?.(activeSource.id)}>
                  {isScanningSource ? 'Rescanning…' : 'Rescan'}
                </button>
                <button type="button" onClick={() => onDeleteSource?.(activeSource.id, activeSource.name)}>
                  Delete
                </button>
              </div>
            ) : null}
            {activeSource.status !== 'online' ? (
              <p className="cp-source-card__availability-warning" role="note">
                {activeSource.status === 'offline' ? 'Source is offline. Connect the volume before using it.' : 'Source is unavailable.'}
              </p>
            ) : null}

            <dl className="metadata-list metadata-list--source">
              <div>
                <dt>Source path</dt>
                <dd className="metadata-list__code">{activeSource.rootPath}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{activeSource.status}</dd>
              </div>
              <div>
                <dt>Indexed photos</dt>
                <dd>{activeSource.photoCount}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {selectedPhoto ? (
          <>
            <div className="cp-photo-info">
              <p className="eyebrow">Current Photo</p>
              <h3 className="cp-photo-name">{selectedPhoto.fileName}</h3>
              <p className="cp-photo-date">{formatDate(selectedPhoto.capturedAt)}</p>
            </div>

            <div className="cp-actions">
              <button
                className={`cp-action-btn${selectedPhoto.isFavorite ? ' cp-action-btn--fav' : ''}`}
                type="button"
                onClick={() => onToggleFavorite?.(selectedPhoto.id)}
              >
                <Star
                  size={14}
                  strokeWidth={2}
                  fill={selectedPhoto.isFavorite ? 'currentColor' : 'none'}
                />
                {selectedPhoto.isFavorite ? 'Favorited' : 'Favorite'}
              </button>
              <button
                className={`cp-action-btn${selectedPhoto.isHidden ? ' cp-action-btn--muted' : ''}`}
                type="button"
                onClick={() => onToggleHidden?.(selectedPhoto.id)}
              >
                {selectedPhoto.isHidden ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
                {selectedPhoto.isHidden ? 'Unhide' : 'Hide'}
              </button>
              {selectedPhoto.id.startsWith('apple-photos:') && onLoadApplePhotosOriginal && (
                <button
                  className="cp-action-btn cp-action-btn--full"
                  type="button"
                  disabled={originalLoadingPhotoId === selectedPhoto.id}
                  onClick={async () => {
                    setOriginalLoadingPhotoId(selectedPhoto.id)
                    setOriginalStatus(null)
                    const path = await onLoadApplePhotosOriginal(selectedPhoto.id)
                    setOriginalStatus(path ? 'Original loaded' : 'Original unavailable')
                    setOriginalLoadingPhotoId(null)
                  }}
                >
                  {originalLoadingPhotoId === selectedPhoto.id ? 'Loading…' : 'Load'}
                </button>
              )}
              {originalStatus && <p className="cp-original-status" role="status">{originalStatus}</p>}
              {onRevealInFinder && !selectedPhoto.id.startsWith('apple-photos:') && (
                <button
                  className="cp-action-btn cp-action-btn--full"
                  type="button"
                  onClick={() => onRevealInFinder(selectedPhoto.id)}
                >
                  Show in Finder
                </button>
              )}
              <div className="cp-album-picker">
                <button
                  className="cp-action-btn"
                  type="button"
                  onClick={() => openAlbumDialog('single-add')}
                >
                  + Add to Album
                </button>
              </div>
              {currentAlbumId ? (
                <div className="cp-album-picker">
                  <button
                    className="cp-action-btn cp-action-btn--muted"
                    type="button"
                    onClick={() => openAlbumDialog('single-remove')}
                  >
                    - Remove from Album
                  </button>
                </div>
              ) : null}
            </div>

            {selectedPhotoQuality && (
              <div className={`cp-quality-card cp-quality-card--${selectedPhotoQuality.label}`}>
                <div>
                  <p className="eyebrow">Photo Quality</p>
                  <strong>{selectedPhotoQuality.score}</strong>
                </div>
                <p>{selectedPhotoQuality.reasons.slice(0, 4).join(' · ')}</p>
              </div>
            )}

            <div className="photo-tags">
              <p className="eyebrow">Tags</p>
              <form
                className="photo-tags__row"
                onSubmit={(e) => {
                  e.preventDefault()
                  const tag = tagInput.trim()
                  if (tag && !(selectedPhoto.tags ?? []).includes(tag)) {
                    void onSetPhotoTags?.(selectedPhoto.id, [...(selectedPhoto.tags ?? []), tag])
                  }
                  setTagInput('')
                }}
              >
                {(selectedPhoto.tags ?? []).map((tag) => (
                  <span className="photo-tag" key={tag}>
                    {tag}
                    <button
                      className="photo-tag__remove"
                      type="button"
                      title={`Remove tag "${tag}"`}
                      onClick={() => {
                        const newTags = (selectedPhoto.tags ?? []).filter((t) => t !== tag)
                        void onSetPhotoTags?.(selectedPhoto.id, newTags)
                      }}
                    >×</button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  className="photo-tags__input"
                  placeholder="Add tag…"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                />
              </form>
            </div>

            <dl className="metadata-list">
              <div>
                <dt>Source</dt>
                <dd>{selectedPhoto.sourceName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selectedPhoto.sourceStatus}</dd>
              </div>
              <div>
                <dt>File Size</dt>
                <dd>{formatFileSize(selectedPhoto.fileSize)}</dd>
              </div>
              <div>
                <dt>Folder</dt>
                <dd>{selectedPhoto.folderPath || 'Source root'}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd className={!(selectedPhoto.width && selectedPhoto.height) ? 'is-pending' : ''}>
                  {selectedPhoto.width && selectedPhoto.height
                    ? `${selectedPhoto.width} × ${selectedPhoto.height}`
                    : 'Pending'}
                </dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd className={!selectedPhoto.cameraMake && !selectedPhoto.cameraModel ? 'is-pending' : ''}>
                  {formatCamera(selectedPhoto)}
                </dd>
              </div>
              <div>
                <dt>Lens</dt>
                <dd className={!selectedPhoto.lensModel ? 'is-pending' : ''}>
                  {selectedPhoto.lensModel || 'Pending'}
                </dd>
              </div>
              <div>
                <dt>GPS</dt>
                <dd className={selectedPhoto.gpsLatitude === null ? 'is-pending' : ''}>
                  {formatGps(selectedPhoto.gpsLatitude, selectedPhoto.gpsLongitude)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mono-muted">No photo selected</p>
        )}
      </section>
        </div>
      )}
      {isAlbumDialogOpen && (
        <div
          className="album-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAlbumDialog()
          }}
        >
          <section
            aria-label={albumDialogTitle}
            aria-modal="true"
            className="album-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="album-dialog__header">
              <div>
                <p className="eyebrow">Album</p>
                <h2>{albumDialogTitle}</h2>
              </div>
              <button
                aria-label="Close album picker"
                className="album-dialog__close"
                type="button"
                onClick={closeAlbumDialog}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </header>

            <label className="album-dialog__search">
              <Search size={15} strokeWidth={2} />
              <input
                autoFocus
                aria-label="Search albums"
                placeholder="Search albums"
                type="search"
                value={albumDialogQuery}
                onChange={(event) => setAlbumDialogQuery(event.target.value)}
              />
            </label>

            <div className="album-dialog__list" aria-label="Albums">
              {filteredAlbums.length > 0 ? (
                filteredAlbums.map((album) => {
                  const isCurrentAlbum = currentAlbumId === album.id
                  return (
                    <button
                      aria-label={`${isRemoveAlbumDialog ? 'Remove from' : 'Add to'} ${album.name}`}
                      className="album-dialog__item"
                      key={album.id}
                      type="button"
                      onClick={() => applyAlbum(album.id)}
                    >
                      <span className="album-dialog__item-main">
                        <span className="album-dialog__item-name">{album.name}</span>
                        <span className="album-dialog__item-count">{album.photoCount} photos</span>
                      </span>
                      {isCurrentAlbum ? <span className="album-dialog__item-badge">Current</span> : null}
                    </button>
                  )
                })
              ) : (
                <div className="album-dialog__empty">
                  <strong>{isRemoveAlbumDialog ? 'No album to remove from' : albums.length === 0 ? 'Create an album first' : 'No albums match'}</strong>
                </div>
              )}
            </div>

            {!isRemoveAlbumDialog ? (
              <form className="album-dialog__create" onSubmit={handleCreateAlbumInDialog}>
                <input
                  aria-label="New album name"
                  placeholder="New album name"
                  type="text"
                  value={albumDialogCreateName}
                  onChange={(event) => setAlbumDialogCreateName(event.target.value)}
                />
                <button type="submit" disabled={!albumDialogCreateName.trim() || !onCreateAlbum}>
                  Create album
                </button>
              </form>
            ) : null}
          </section>
        </div>
      )}
    </aside>
  )
}
