import { useEffect, useMemo, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getPhotoDataUrl, getThumbnailFile } from '../desktop/photos'
import type { TimelinePhoto } from '../types/photos'
import { PhotoCard } from './PhotoCard'

type PhotoGalleryProps = {
  photos: TimelinePhoto[]
  selectedPhotoId: string | null
  onSelectPhoto: (photo: TimelinePhoto) => void
  onOpenPhoto: (photo: TimelinePhoto) => void
}

export function PhotoGallery({
  photos,
  selectedPhotoId,
  onSelectPhoto,
  onOpenPhoto,
}: PhotoGalleryProps) {
  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0] ?? null,
    [photos, selectedPhotoId],
  )
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!selectedPhoto) {
      setImageUrl(null)
      setFallbackUrl(null)
      setHasError(false)
      setIsLoading(false)
      return
    }

    let cancelled = false

    const loadPreview = async () => {
      setIsLoading(true)
      setHasError(false)
      setImageUrl(null)
      setFallbackUrl(null)

      const originalUrl = await getPhotoDataUrl(selectedPhoto.id)
      const largePath = await getThumbnailFile(selectedPhoto.id, 'large')

      if (cancelled) {
        return
      }

      const largePreviewUrl = largePath ? convertFileSrc(largePath) : null

      if (!originalUrl && !largePreviewUrl) {
        setHasError(true)
        setIsLoading(false)
        return
      }

      setImageUrl(originalUrl ?? largePreviewUrl)
      setFallbackUrl(largePreviewUrl)
      setIsLoading(false)
    }

    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [selectedPhoto])

  if (!selectedPhoto) {
    return null
  }

  return (
    <div className="photo-gallery" aria-label="Gallery view">
      <div className="photo-gallery__strip" aria-label="Gallery thumbnails">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            variant="thumbnail"
            selected={photo.id === selectedPhoto.id}
            onClick={() => onSelectPhoto(photo)}
          />
        ))}
      </div>

      <button
        type="button"
        className="photo-gallery__stage"
        aria-label={`Open ${selectedPhoto.fileName}`}
        onClick={() => onOpenPhoto(selectedPhoto)}
      >
        {isLoading && <span className="photo-gallery__loading" />}
        {imageUrl && !hasError && (
          <img
            className="photo-gallery__image"
            src={imageUrl}
            alt={selectedPhoto.fileName}
            onError={() => {
              if (fallbackUrl && imageUrl !== fallbackUrl) {
                setImageUrl(fallbackUrl)
                return
              }

              setHasError(true)
              setIsLoading(false)
            }}
          />
        )}
        {hasError && <span className="photo-gallery__error">Failed to load</span>}
      </button>
    </div>
  )
}
