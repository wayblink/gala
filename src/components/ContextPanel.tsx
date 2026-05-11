import { useRef, useState } from 'react'
import { Eye, EyeOff, Star } from 'lucide-react'
import type { LibrarySummary } from '../types/library'
import type { Album, TimelinePhoto } from '../types/photos'

type ContextPanelProps = {
  librarySummary: LibrarySummary
  selectedPhoto: TimelinePhoto | null
  onToggleFavorite?: (photoId: string) => void
  onToggleHidden?: (photoId: string) => void
  albums?: Album[]
  currentAlbumId?: string
  onAddToAlbum?: (albumId: string, photoId: string) => void
  onRemoveFromAlbum?: (albumId: string, photoId: string) => void
  onSetPhotoTags?: (photoId: string, tags: string[]) => Promise<void>
  onRevealInFinder?: (photoId: string) => Promise<void>
  collapsed?: boolean
  onToggleCollapse?: () => void
  // Batch mode
  selectionMode?: boolean
  selectedIds?: Set<string>
  onBatchFavorite?: (photoIds: string[], favorited: boolean) => Promise<void>
  onBatchHide?: (photoIds: string[], hidden: boolean) => Promise<void>
  onBatchAddTags?: (photoIds: string[], tags: string[]) => Promise<void>
  onBatchAddToAlbum?: (albumId: string, photoIds: string[]) => Promise<void>
  onBatchRemoveFromAlbum?: (albumId: string, photoIds: string[]) => Promise<void>
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

export function ContextPanel({
  librarySummary,
  selectedPhoto,
  onToggleFavorite,
  onToggleHidden,
  albums = [],
  currentAlbumId,
  onAddToAlbum,
  onRemoveFromAlbum,
  onSetPhotoTags,
  onRevealInFinder,
  collapsed = false,
  onToggleCollapse = () => undefined,
  selectionMode = false,
  selectedIds,
  onBatchFavorite,
  onBatchHide,
  onBatchAddTags,
  onBatchAddToAlbum,
  onBatchRemoveFromAlbum,
}: ContextPanelProps) {
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [batchTagInput, setBatchTagInput] = useState('')
  const [batchAlbumPickerOpen, setBatchAlbumPickerOpen] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const selectedCount = selectedIds?.size ?? 0
  const isBatchMode = selectionMode && selectedCount > 0
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
      <section>
        <p className="eyebrow">Library Index</p>
        <p className="mono-muted">
          {librarySummary.totalPhotos} photos indexed
        </p>
        {librarySummary.sources.length > 0 && (
          <ul className="safety-list">
            {librarySummary.sources.map((source) => (
              <li key={source.id} className={source.status === 'online' ? 'is-online' : ''}>
                {source.name} · {source.photoCount} photos
              </li>
            ))}
          </ul>
        )}
      </section>
      {isBatchMode ? (
        <section className="cp-photo-section cp-batch-section">
          <div className="cp-photo-info">
            <p className="eyebrow">Batch Selection</p>
            <h3 className="cp-photo-name">{selectedCount} photos selected</h3>
          </div>

          <div className="cp-actions">
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchFavorite}
              onClick={() => void onBatchFavorite?.(Array.from(selectedIds!), true)}
            >
              <Star size={14} strokeWidth={2} fill="currentColor" /> Favorite all
            </button>
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchFavorite}
              onClick={() => void onBatchFavorite?.(Array.from(selectedIds!), false)}
            >
              <Star size={14} strokeWidth={2} /> Unfavorite
            </button>
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchHide}
              onClick={() => void onBatchHide?.(Array.from(selectedIds!), true)}
            >
              <EyeOff size={14} strokeWidth={2} /> Hide all
            </button>
            <button
              className="cp-action-btn"
              type="button"
              disabled={!onBatchHide}
              onClick={() => void onBatchHide?.(Array.from(selectedIds!), false)}
            >
              <Eye size={14} strokeWidth={2} /> Unhide
            </button>
            {albums.length > 0 && (
              <div className="cp-album-picker">
                <button
                  className="cp-action-btn"
                  type="button"
                  onClick={() => setBatchAlbumPickerOpen((p) => !p)}
                >
                  + Add all to Album
                </button>
                {batchAlbumPickerOpen && (
                  <div className="album-picker__list">
                    {albums.map((album) => (
                      <button
                        className="album-picker__item"
                        key={album.id}
                        type="button"
                        onClick={() => {
                          if (currentAlbumId === album.id && onBatchRemoveFromAlbum) {
                            void onBatchRemoveFromAlbum(album.id, Array.from(selectedIds!))
                          } else if (onBatchAddToAlbum) {
                            void onBatchAddToAlbum(album.id, Array.from(selectedIds!))
                          }
                          setBatchAlbumPickerOpen(false)
                        }}
                      >
                        {currentAlbumId === album.id ? '− ' : '+ '}{album.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="photo-tags">
            <p className="eyebrow">Add tag to selection</p>
            <form
              className="photo-tags__row"
              onSubmit={(e) => {
                e.preventDefault()
                const tag = batchTagInput.trim()
                if (tag && onBatchAddTags) {
                  void onBatchAddTags(Array.from(selectedIds!), [tag])
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
      ) : (
      <section className="cp-photo-section">
        {selectedPhoto ? (
          <>
            <div className="cp-photo-info">
              <p className="eyebrow">Selected Photo</p>
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
              {onRevealInFinder && (
                <button
                  className="cp-action-btn cp-action-btn--full"
                  type="button"
                  onClick={() => onRevealInFinder(selectedPhoto.id)}
                >
                  Show in Finder
                </button>
              )}
              {albums.length > 0 && (
                <div className="cp-album-picker">
                  <button
                    className="cp-action-btn"
                    type="button"
                    onClick={() => setAlbumPickerOpen((p) => !p)}
                  >
                    + Add to Album
                  </button>
                  {albumPickerOpen && (
                    <div className="album-picker__list">
                      {albums.map((album) => (
                        <button
                          className="album-picker__item"
                          key={album.id}
                          type="button"
                          onClick={() => {
                            if (currentAlbumId === album.id) {
                              onRemoveFromAlbum?.(album.id, selectedPhoto.id)
                            } else {
                              onAddToAlbum?.(album.id, selectedPhoto.id)
                            }
                            setAlbumPickerOpen(false)
                          }}
                        >
                          {currentAlbumId === album.id ? '✓ ' : ''}{album.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

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
      )}
        </div>
      )}
    </aside>
  )
}
