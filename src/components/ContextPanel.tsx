import type { DesktopEnvironment } from '../desktop/environment'
import type { LibrarySummary } from '../types/library'
import type { TimelinePhoto } from '../types/photos'

type ContextPanelProps = {
  desktopEnvironment: DesktopEnvironment
  librarySummary: LibrarySummary
  selectedPhoto: TimelinePhoto | null
  onToggleFavorite?: (photoId: string) => void
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

export function ContextPanel({ desktopEnvironment, librarySummary, selectedPhoto, onToggleFavorite }: ContextPanelProps) {
  return (
    <aside className="context-panel" aria-label="View context">
      <section>
        <p className="eyebrow">View Context</p>
        <h2>Timeline</h2>
        <p className="mono-muted">Built-in strategy</p>
      </section>
      <section>
        <p className="eyebrow">Why Visible</p>
        <p>
          Photos are grouped by captured date. Items without capture dates use import time and remain marked in the grid.
        </p>
      </section>
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
      <section>
        <p className="eyebrow">Desktop Runtime</p>
        <p className="mono-muted">
          {desktopEnvironment.runtime} · {desktopEnvironment.platform} · {desktopEnvironment.engine}
        </p>
      </section>
      <section>
        <p className="eyebrow">Selected Photo</p>
        {selectedPhoto ? (
          <>
            <h3>{selectedPhoto.fileName}</h3>
            <p className="mono-muted">{formatDate(selectedPhoto.capturedAt)}</p>
            <button
              className={`fav-toggle${selectedPhoto.isFavorite ? ' fav-toggle--active' : ''}`}
              type="button"
              onClick={() => onToggleFavorite?.(selectedPhoto.id)}
            >
              {selectedPhoto.isFavorite ? '★ Unfavorite' : '☆ Favorite'}
            </button>
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
                <dt>Relative Path</dt>
                <dd>{selectedPhoto.relativePath}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {selectedPhoto.width && selectedPhoto.height
                    ? `${selectedPhoto.width} x ${selectedPhoto.height}`
                    : 'Pending'}
                </dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{formatCamera(selectedPhoto)}</dd>
              </div>
              <div>
                <dt>Lens</dt>
                <dd>{selectedPhoto.lensModel || 'Pending'}</dd>
              </div>
              <div>
                <dt>GPS</dt>
                <dd>{formatGps(selectedPhoto.gpsLatitude, selectedPhoto.gpsLongitude)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mono-muted">No photo selected</p>
        )}
      </section>
      <div className="context-panel__actions">
        <button className="primary-button" type="button">Save View</button>
        <button className="secondary-button" type="button">Explain</button>
      </div>
    </aside>
  )
}
