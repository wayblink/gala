import { useEffect, useState } from 'react'
import { getTimelinePhotos } from '../desktop/photos'
import type { TimelinePhoto } from '../types/photos'
import { PhotoCard } from './PhotoCard'

const PHOTOS_PER_PAGE = 50

export function PhotoSurface() {
  const [photos, setPhotos] = useState<TimelinePhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    const loadPhotos = async () => {
      console.log('[PhotoSurface] Loading photos, offset:', offset)
      setIsLoading(true)
      const newPhotos = await getTimelinePhotos(PHOTOS_PER_PAGE, offset)
      console.log('[PhotoSurface] Loaded', newPhotos.length, 'photos')
      if (newPhotos.length < PHOTOS_PER_PAGE) {
        setHasMore(false)
      }
      // Only append if offset > 0, otherwise replace
      setPhotos((prev) => (offset === 0 ? newPhotos : [...prev, ...newPhotos]))
      setIsLoading(false)
    }

    void loadPhotos()
  }, [offset])

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 500

    if (isNearBottom && hasMore && !isLoading) {
      console.log('[PhotoSurface] Near bottom, loading more')
      setOffset((prev) => prev + PHOTOS_PER_PAGE)
    }
  }

  return (
    <main
      className="photo-surface"
      aria-label="Timeline photo surface"
      onScroll={handleScroll}
    >
      {photos.length === 0 && !isLoading && (
        <div className="photo-surface__empty">
          <p>No photos indexed yet. Add a folder to get started.</p>
        </div>
      )}

      <div className="photo-grid">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} />
        ))}
      </div>

      {isLoading && (
        <div className="photo-surface__loading">
          <p>Loading photos...</p>
        </div>
      )}
    </main>
  )
}

