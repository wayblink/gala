import { useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getThumbnailFile } from '../desktop/photos'
import type { TimelinePhoto } from '../types/photos'

type PhotoCardProps = {
  photo: TimelinePhoto
  onClick?: () => void
}

export function PhotoCard({ photo, onClick }: PhotoCardProps) {
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
    <div className="photo-card" onClick={onClick} role="button" tabIndex={0}>
      {isLoading && <div className="photo-card__skeleton" />}
      {thumbnailUrl && !error && (
        <img
          src={thumbnailUrl}
          alt={photo.fileName}
          className="photo-card__image"
          onError={() => setError(true)}
        />
      )}
      {error && <div className="photo-card__error">Failed to load</div>}
    </div>
  )
}
