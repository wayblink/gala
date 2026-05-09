import { useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getThumbnailFile } from '../desktop/photos'
import type { TimelinePhoto } from '../types/photos'

type PhotoCardProps = {
  photo: TimelinePhoto
  variant?: 'thumbnail' | 'list' | 'gallery'
  selected?: boolean
  onClick?: () => void
}

const formatDate = (value: string | null) => {
  if (!value) return 'No date'

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

const formatDimensions = (photo: TimelinePhoto) => {
  if (!photo.width || !photo.height) return 'Pending'
  return `${photo.width} x ${photo.height}`
}

export function PhotoCard({
  photo,
  variant = 'thumbnail',
  selected = false,
  onClick,
}: PhotoCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadThumbnail = async () => {
      setIsLoading(true)
      setError(false)

      if (photo.thumbnailPath) {
        // Use Tauri's convertFileSrc to get proper URL
        const url = convertFileSrc(photo.thumbnailPath)
        setThumbnailUrl(url)
        setIsLoading(false)
      } else {
        // Try to get thumbnail from command
        const path = await getThumbnailFile(photo.id, 'medium')
        if (path) {
          const url = convertFileSrc(path)
          setThumbnailUrl(url)
        } else {
          setError(true)
        }
        setIsLoading(false)
      }
    }

    void loadThumbnail()
  }, [photo])

  return (
    <button
      type="button"
      className={`photo-card photo-card--${variant}${selected ? ' photo-card--selected' : ''}`}
      onClick={onClick}
      aria-label={`Open ${photo.fileName}`}
      aria-pressed={selected}
    >
      <span className="photo-card__thumb" aria-hidden={variant === 'list'}>
        {isLoading && <span className="photo-card__skeleton" />}
        {thumbnailUrl && !error && (
          <img
            src={thumbnailUrl}
            alt={variant === 'list' ? '' : photo.fileName}
            className="photo-card__image"
            onError={() => setError(true)}
          />
        )}
        {error && <span className="photo-card__error">Failed to load</span>}
      </span>

      {variant !== 'thumbnail' && (
        <span className="photo-card__meta">
          <span className="photo-card__name">{photo.fileName}</span>
          {variant === 'list' ? (
            <>
              <span>{formatDate(photo.capturedAt)}</span>
              <span>{photo.folderPath || 'Source root'}</span>
              <span>{photo.sourceName}</span>
              <span>{formatDimensions(photo)}</span>
              <span>{formatFileSize(photo.fileSize)}</span>
            </>
          ) : (
            <span className="photo-card__subline">
              {formatDate(photo.capturedAt)} · {formatDimensions(photo)}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
