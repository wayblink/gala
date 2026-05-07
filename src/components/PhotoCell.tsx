import type { PhotoItem } from '../types'

type PhotoCellProps = {
  photo: PhotoItem
  selected?: boolean
}

export function PhotoCell({ photo, selected = false }: PhotoCellProps) {
  const unavailableLabel =
    photo.status === 'missing' ? 'Missing' : photo.status === 'offline' ? 'Offline' : null

  return (
    <button
      className={`photo-cell${selected ? ' photo-cell--selected' : ''} ${
        unavailableLabel ? 'photo-cell--unavailable' : ''
      }`}
      style={{ backgroundColor: photo.color, aspectRatio: photo.aspectRatio }}
      aria-label={`${selected ? 'Selected photo ' : 'Photo '}${photo.fileName}`}
    >
      <span className="photo-cell__grain" aria-hidden="true" />
      {unavailableLabel ? <span className="photo-cell__badge">{unavailableLabel}</span> : null}
    </button>
  )
}
