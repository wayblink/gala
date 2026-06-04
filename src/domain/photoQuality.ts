export type PhotoQualityInput = {
  id: string
  fileName: string
  width?: number | null
  height?: number | null
  fileSize?: number | null
  isFavorite?: boolean
  isHidden?: boolean
  quality?: PhotoQualityScore | null
}

export type PhotoQualityScore = {
  photoId: string
  score: number
  label: 'strong' | 'solid' | 'weak'
  reasons: string[]
}

const PHOTO_FORMATS = new Set(['jpg', 'jpeg', 'heic', 'heif', 'dng', 'raw', 'arw', 'cr2', 'nef'])

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)))

const normalizePersistedQuality = (quality: PhotoQualityScore, photoId: string): PhotoQualityScore => ({
  photoId,
  score: clampScore(quality.score),
  label: quality.label,
  reasons: quality.reasons,
})

export function computePhotoQualityScore(photo: PhotoQualityInput): PhotoQualityScore {
  if (photo.quality) return normalizePersistedQuality(photo.quality, photo.id)

  const reasons: string[] = []
  let score = 42

  const width = photo.width ?? null
  const height = photo.height ?? null
  if (width && height && width > 0 && height > 0) {
    const megapixels = (width * height) / 1_000_000
    const resolutionBonus = Math.min(26, Math.log2(Math.max(1, megapixels)) * 10)
    score += resolutionBonus
    if (megapixels >= 10) reasons.push('high resolution')
    else if (megapixels >= 3) reasons.push('usable resolution')
    else reasons.push('low resolution')

    const longEdge = Math.max(width, height)
    const shortEdge = Math.min(width, height)
    const aspect = longEdge / shortEdge
    if (aspect > 2.6) {
      score -= 8
      reasons.push('extreme crop')
    } else if (aspect < 1.9) {
      score += 4
      reasons.push('balanced frame')
    }
  } else {
    score -= 8
    reasons.push('missing dimensions')
  }

  const fileSize = photo.fileSize ?? null
  if (fileSize && fileSize > 0) {
    const mb = fileSize / 1_000_000
    if (mb >= 2) {
      score += Math.min(14, Math.log2(mb) * 5)
      reasons.push('larger source file')
    } else if (mb < 0.25) {
      score -= 10
      reasons.push('small source file')
    }
  } else {
    score -= 5
    reasons.push('missing file size')
  }

  const extension = photo.fileName.split('.').pop()?.toLowerCase()
  if (extension && PHOTO_FORMATS.has(extension)) {
    score += 5
    reasons.push('photo format')
  }

  if (photo.isFavorite) {
    score += 12
    reasons.push('already favorited')
  }
  if (photo.isHidden) {
    score -= 24
    reasons.push('already hidden')
  }

  const finalScore = clampScore(score)
  return {
    photoId: photo.id,
    score: finalScore,
    label: finalScore >= 75 ? 'strong' : finalScore >= 55 ? 'solid' : 'weak',
    reasons,
  }
}

export function recommendHighestQualityPhotoId(photos: PhotoQualityInput[]): string | null {
  if (photos.length === 0) return null
  return [...photos]
    .map((photo, index) => ({ photo, index, quality: computePhotoQualityScore(photo) }))
    .sort((a, b) => {
      if (b.quality.score !== a.quality.score) return b.quality.score - a.quality.score
      const aPixels = (a.photo.width ?? 0) * (a.photo.height ?? 0)
      const bPixels = (b.photo.width ?? 0) * (b.photo.height ?? 0)
      if (bPixels !== aPixels) return bPixels - aPixels
      if ((b.photo.fileSize ?? 0) !== (a.photo.fileSize ?? 0)) return (b.photo.fileSize ?? 0) - (a.photo.fileSize ?? 0)
      return a.index - b.index
    })[0].photo.id
}
