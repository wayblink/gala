import { useEffect, useState } from 'react'
import {
  getFavoritePhotos,
  getRecentlyAddedPhotos,
  getTimelinePhotos,
  searchPhotos,
} from '../desktop/photos'
import type { PhotoFilter, TimelinePhoto } from '../types/photos'
import { PhotoCard } from './PhotoCard'
import { PhotoViewer } from './PhotoViewer'

const PHOTOS_PER_PAGE = 50

type PhotoSurfaceProps = {
  filter: PhotoFilter | null
  title: string
  selectedPhotoId: string | null
  searchQuery: string
  onSelectPhoto: (photo: TimelinePhoto) => void
}

function filterKey(filter: PhotoFilter | null, searchQuery: string): string {
  const trimmedSearch = searchQuery.trim()
  if (trimmedSearch) return `search:${trimmedSearch}`
  if (!filter) return 'all'
  if (filter.type === 'recent') return 'recent'
  if (filter.type === 'favorites') return 'favorites'
  return `folder:${filter.sourceId}:${filter.folderPath}`
}

export function PhotoSurface({
  filter,
  title,
  selectedPhotoId,
  searchQuery,
  onSelectPhoto,
}: PhotoSurfaceProps) {
  const [photos, setPhotos] = useState<TimelinePhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const trimmedSearchQuery = searchQuery.trim()
  const currentFilterKey = filterKey(filter, searchQuery)

  useEffect(() => {
    setPhotos([])
    setIsLoading(true)
    setOffset(0)
    setHasMore(true)
    setViewerIndex(null)
  }, [currentFilterKey])

  useEffect(() => {
    let cancelled = false

    const loadPhotos = async () => {
      if (!hasMore && offset !== 0) {
        return
      }

      setIsLoading(true)

      let newPhotos: TimelinePhoto[]
      if (trimmedSearchQuery) {
        newPhotos = await searchPhotos(trimmedSearchQuery, PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'recent') {
        newPhotos = await getRecentlyAddedPhotos(PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'favorites') {
        newPhotos = await getFavoritePhotos(PHOTOS_PER_PAGE, offset)
      } else {
        newPhotos = await getTimelinePhotos(PHOTOS_PER_PAGE, offset, filter)
      }

      if (cancelled) {
        return
      }

      if (newPhotos.length < PHOTOS_PER_PAGE) {
        setHasMore(false)
      }
      setPhotos((prev) => (offset === 0 ? newPhotos : [...prev, ...newPhotos]))
      if (offset === 0 && newPhotos.length > 0) {
        onSelectPhoto(newPhotos[0])
      }
      setIsLoading(false)
    }

    void loadPhotos()

    return () => {
      cancelled = true
    }
  }, [filter, currentFilterKey, hasMore, offset, onSelectPhoto, trimmedSearchQuery])

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 500

    if (isNearBottom && hasMore && !isLoading) {
      setOffset((prev) => prev + PHOTOS_PER_PAGE)
    }
  }

  return (
    <main
      className="photo-surface"
      aria-label="Timeline photo surface"
      onScroll={handleScroll}
    >
      <section className="timeline-group">
        <div className="timeline-group__header">
          <div>
            <h2>{title}</h2>
            <p>{photos.length} visible photos</p>
          </div>
        </div>
      </section>

      {photos.length === 0 && !isLoading && (
        <div className="photo-surface__empty">
          <p>No photos found in this view.</p>
        </div>
      )}

      <div className="photo-grid">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            selected={photo.id === selectedPhotoId}
            onClick={() => {
              onSelectPhoto(photo)
              setViewerIndex(index)
            }}
          />
        ))}
      </div>

      {isLoading && (
        <div className="photo-surface__loading">
          <p>Loading photos...</p>
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          onPhotoChange={onSelectPhoto}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </main>
  )
}
