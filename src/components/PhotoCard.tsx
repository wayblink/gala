import { useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { downloadApplePhotosThumbnail, getThumbnailFile } from '../desktop/photos'
import { isTauriAvailable } from '../desktop/tauri'
import { computePhotoQualityScore } from '../domain/photoQuality'
import type { TimelinePhoto } from '../types/photos'

type PhotoCardProps = {
  photo: TimelinePhoto
  variant?: 'thumbnail' | 'list' | 'gallery'
  selected?: boolean
  onClick?: () => void
  onHover?: () => void
  showQuality?: boolean
  originalPath?: string
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
  return `${photo.width} × ${photo.height}`
}

const photoAssetUrl = (path: string) => isTauriAvailable() ? convertFileSrc(path) : `/@fs${path}`

export function PhotoCard({
  photo,
  variant = 'thumbnail',
  selected = false,
  onClick,
  onHover,
  showQuality = false,
  originalPath,
}: PhotoCardProps) {
  const quality = showQuality ? computePhotoQualityScore(photo) : null
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isCloudDownloadAvailable, setIsCloudDownloadAvailable] = useState(false)
  const [isDownloadingCloudThumbnail, setIsDownloadingCloudThumbnail] = useState(false)

  useEffect(() => {
    const loadThumbnail = async () => {
      setIsLoading(true)
      setError(false)
      setIsCloudDownloadAvailable(false)
      setIsDownloadingCloudThumbnail(false)

      if (originalPath) {
        const url = photoAssetUrl(originalPath)
        setThumbnailUrl(url)
        setIsLoading(false)
      } else if (photo.thumbnailPath) {
        const url = photoAssetUrl(photo.thumbnailPath)
        setThumbnailUrl(url)
        setIsLoading(false)
      } else {
        // Try to get thumbnail from command
        const path = await getThumbnailFile(photo.id, 'medium')
        if (path) {
          const url = photoAssetUrl(path)
          setThumbnailUrl(url)
        } else if (photo.id.startsWith('apple-photos:')) {
          setIsCloudDownloadAvailable(true)
        } else {
          setError(true)
        }
        setIsLoading(false)
      }
    }

    void loadThumbnail()
  }, [photo, originalPath])

  const handleCloudDownload = async (event: React.MouseEvent) => {
    event.stopPropagation()
    setIsDownloadingCloudThumbnail(true)
    setError(false)
    const path = await downloadApplePhotosThumbnail(photo.id, 'medium')
    if (path) {
      setThumbnailUrl(photoAssetUrl(path))
      setIsCloudDownloadAvailable(false)
    } else {
      setError(true)
    }
    setIsDownloadingCloudThumbnail(false)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`photo-card photo-card--${variant}${selected ? ' photo-card--selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onClick) {
          event.preventDefault()
          onClick()
        }
      }}
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
        {isCloudDownloadAvailable && !error && (
          <span className="photo-card__cloud-state">
            <span>Available in iCloud</span>
            <button
              type="button"
              className="photo-card__cloud-download"
              aria-label={`Download ${photo.fileName} from iCloud`}
              onClick={handleCloudDownload}
              disabled={isDownloadingCloudThumbnail}
            >
              {isDownloadingCloudThumbnail ? 'Loading…' : 'Download from iCloud'}
            </button>
          </span>
        )}
        {quality && (
          <span className={`photo-card__quality photo-quality-badge photo-quality-badge--${quality.label}`}>
            {quality.score}
          </span>
        )}
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
              {quality && <span className="photo-card__quality-label">Quality {quality.score}</span>}
            </>
          ) : (
            <span className="photo-card__subline">
              {formatDate(photo.capturedAt)} · {formatDimensions(photo)}
              {quality ? ` · Quality ${quality.score}` : ''}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
