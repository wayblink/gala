import { selectedPhoto, timelineGroups } from '../data/mockLibrary'
import { PhotoCell } from './PhotoCell'

export function PhotoSurface() {
  return (
    <main className="photo-surface" aria-label="Timeline photo surface">
      {timelineGroups.map((group) => (
        <section className="timeline-group" key={group.key}>
          <div className="timeline-group__header">
            <div>
              <h2>{group.year}</h2>
              <p>
                {group.monthLabel} · {group.count} photos
                {group.dateBasis === 'imported' ? ' · includes imported-date fallback' : ''}
              </p>
            </div>
            <span>Density: Standard</span>
          </div>
          <div className="photo-grid">
            {group.photos.map((photo) => (
              <PhotoCell key={photo.id} photo={photo} selected={photo.id === selectedPhoto.id} />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
