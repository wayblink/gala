import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getPhotoDataUrl, getThumbnailFile, revealInFinder } from '../desktop/photos'
import { isTauriAvailable } from '../desktop/tauri'
import type { TimelinePhoto } from '../types/photos'

type PhotoViewerProps = {
  photos: TimelinePhoto[]
  initialIndex: number
  onPhotoChange?: (photo: TimelinePhoto | null) => void
  onClose: () => void
  originalPaths?: Record<string, string>
  onLoadOriginal?: (photoId: string) => Promise<string | null>
}

const photoAssetUrl = (path: string) => isTauriAvailable() ? convertFileSrc(path) : `/@fs${path}`

export function PhotoViewer({ photos, initialIndex, onPhotoChange, onClose, originalPaths = {}, onLoadOriginal }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isOriginalLoading, setIsOriginalLoading] = useState(false)
  const [originalLoaded, setOriginalLoaded] = useState(false)
  const [originalError, setOriginalError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const currentPhoto = photos[currentIndex]
  const canGoPrevious = currentIndex > 0
  const canGoNext = currentIndex < photos.length - 1

  const capturedDate = useMemo(() => {
    if (!currentPhoto?.capturedAt) {
      return null
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(currentPhoto.capturedAt))
  }, [currentPhoto])

  useEffect(() => {
    setCurrentIndex(Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0)))
  }, [initialIndex, photos.length])

  useEffect(() => {
    if (currentPhoto) {
      onPhotoChange?.(currentPhoto)
    }
  }, [currentPhoto, onPhotoChange])

  useEffect(() => {
    closeButtonRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadPhoto = async () => {
      if (!currentPhoto) {
        return
      }

      setIsLoading(true)
      setHasError(false)
      setImageUrl(null)
      setFallbackUrl(null)
      setOriginalLoaded(Boolean(originalPaths[currentPhoto.id]))
      setOriginalError(false)

      const cachedOriginalUrl = originalPaths[currentPhoto.id] ? photoAssetUrl(originalPaths[currentPhoto.id]) : null
      const originalUrl = cachedOriginalUrl ?? await getPhotoDataUrl(currentPhoto.id)
      const largePath = await getThumbnailFile(currentPhoto.id, 'large')
      const previewPath = largePath ?? currentPhoto.thumbnailPath

      if (isCancelled) {
        return
      }

      const largePreviewUrl = previewPath ? photoAssetUrl(previewPath) : null

      if (!originalUrl && !largePreviewUrl) {
        setHasError(true)
        setIsLoading(false)
        return
      }

      setImageUrl(originalUrl ?? largePreviewUrl)
      setFallbackUrl(largePreviewUrl)
      setIsLoading(false)
    }

    void loadPhoto()

    return () => {
      isCancelled = true
    }
  }, [currentPhoto])

  useEffect(() => {
    const preloadNeighbors = async () => {
      const neighbors = [photos[currentIndex - 1], photos[currentIndex + 1]].filter(Boolean)

      await Promise.all(
        neighbors.map(async (photo) => {
          const largePath = await getThumbnailFile(photo.id, 'large')
          const previewPath = largePath ?? photo.thumbnailPath
          if (previewPath) {
            const image = new Image()
            image.src = photoAssetUrl(previewPath)
          }
        }),
      )
    }

    void preloadNeighbors()
  }, [currentIndex, photos])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isFullscreen) {
          void document.exitFullscreen?.()
          setIsFullscreen(false)
        } else {
          onClose()
        }
      }

      if (event.key === 'ArrowLeft') {
        setCurrentIndex((index) => Math.max(index - 1, 0))
      }

      if (event.key === 'ArrowRight') {
        setCurrentIndex((index) => Math.min(index + 1, photos.length - 1))
      }

      if (event.key === 'f' || event.key === 'F') {
        void toggleFullscreen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, photos.length, isFullscreen])

  const loadOriginal = async () => {
    if (!currentPhoto?.id.startsWith('apple-photos:') || !onLoadOriginal || isOriginalLoading || originalLoaded) return
    setIsOriginalLoading(true)
    setOriginalError(false)
    const path = await onLoadOriginal(currentPhoto.id)
    if (path) {
      setImageUrl(photoAssetUrl(path))
      setFallbackUrl(null)
      setOriginalLoaded(true)
    } else {
      setOriginalError(true)
    }
    setIsOriginalLoading(false)
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  if (!currentPhoto) {
    return null
  }

  return (
    <div
      className={`photo-viewer${isFullscreen ? ' photo-viewer--fullscreen' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={currentPhoto.fileName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="photo-viewer__topbar">
        <div className="photo-viewer__title">
          <strong>{currentPhoto.fileName}</strong>
          {capturedDate && <span>{capturedDate}</span>}
        </div>
        <div className="photo-viewer__counter">
          {currentIndex + 1} / {photos.length}
        </div>
        {isFullscreen && currentPhoto.id.startsWith('apple-photos:') && onLoadOriginal && !originalLoaded && (
          <button
            type="button"
            className="photo-viewer__control photo-viewer__load-control"
            aria-label="Load original"
            onClick={() => void loadOriginal()}
            disabled={isOriginalLoading}
          >
            {isOriginalLoading ? 'Loading…' : 'Load'}
          </button>
        )}
        <button
          type="button"
          className="photo-viewer__control"
          aria-label="Show in Finder"
          title="Show in Finder"
          onClick={() => void revealInFinder(currentPhoto.id)}
        >
          <span style={{ fontSize: 14 }}>Finder</span>
        </button>
        <button
          type="button"
          className="photo-viewer__control"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          onClick={() => void toggleFullscreen()}
        >
          {isFullscreen ? <Minimize2 size={18} strokeWidth={2} /> : <Maximize2 size={18} strokeWidth={2} />}
        </button>
        <button
          type="button"
          className="photo-viewer__control"
          aria-label="Close viewer"
          onClick={onClose}
          ref={closeButtonRef}
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        className="photo-viewer__control photo-viewer__nav photo-viewer__nav--previous"
        aria-label="Previous photo"
        onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
        disabled={!canGoPrevious}
      >
        <ChevronLeft size={28} strokeWidth={1.8} />
      </button>

      <figure className="photo-viewer__stage">
        {isLoading && <div className="photo-viewer__loading" />}
        {imageUrl && !hasError && (
          <img
            src={imageUrl}
            alt={currentPhoto.fileName}
            className="photo-viewer__image"
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
        {hasError && <figcaption className="photo-viewer__error">Failed to load</figcaption>}
      </figure>

      <button
        type="button"
        className="photo-viewer__control photo-viewer__nav photo-viewer__nav--next"
        aria-label="Next photo"
        onClick={() => setCurrentIndex((index) => Math.min(index + 1, photos.length - 1))}
        disabled={!canGoNext}
      >
        <ChevronRight size={28} strokeWidth={1.8} />
      </button>
    </div>
  )
}
