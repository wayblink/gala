export type SimilarReviewCardKind = 'burst' | 'duplicate' | 'same-scene'

export type SimilarReviewCard = {
  id: string
  kind: SimilarReviewCardKind
  photoIds: string[]
  confidence: number
  title: string
  reason: string
  fileNameRange: { first: string; last: string }
  timeSpanMs: number | null
  capturedAt: string | null
}

export type SimilarReviewPhoto = {
  id: string
  fileName: string
  capturedAt: string | null
  sourceName: string
}

export type BuildSimilarReviewQueueOptions = {
  windowMs?: number
}

export const DEFAULT_WINDOW_MS = 30_000
const FILENAME_FALLBACK_MAX_DIFF = 3

const filenameParts = (name: string): { prefix: string; seq: number } | null => {
  const match = /^(.*?)(\d+)(\.[^.]+)?$/.exec(name)
  if (!match) return null
  const prefix = match[1]
  const seq = Number.parseInt(match[2], 10)
  if (!Number.isFinite(seq)) return null
  return { prefix, seq }
}

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

const sortPhotos = (photos: SimilarReviewPhoto[]) =>
  [...photos].sort((a, b) => {
    const aTime = a.capturedAt ? Date.parse(a.capturedAt) : Number.POSITIVE_INFINITY
    const bTime = b.capturedAt ? Date.parse(b.capturedAt) : Number.POSITIVE_INFINITY
    return aTime - bTime || naturalCompare(a.fileName, b.fileName) || a.id.localeCompare(b.id)
  })

const closeByTime = (a: SimilarReviewPhoto, b: SimilarReviewPhoto, windowMs: number): boolean => {
  const aTime = a.capturedAt ? Date.parse(a.capturedAt) : Number.NaN
  const bTime = b.capturedAt ? Date.parse(b.capturedAt) : Number.NaN
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false
  return Math.abs(aTime - bTime) <= windowMs
}

const closeByFilename = (a: SimilarReviewPhoto, b: SimilarReviewPhoto): boolean => {
  if (a.capturedAt || b.capturedAt) return false
  const aParts = filenameParts(a.fileName)
  const bParts = filenameParts(b.fileName)
  if (!aParts || !bParts) return false
  if (aParts.prefix !== bParts.prefix) return false
  return Math.abs(aParts.seq - bParts.seq) <= FILENAME_FALLBACK_MAX_DIFF
}

const computeTimeSpanMs = (group: SimilarReviewPhoto[]): number | null => {
  const times = group
    .map((photo) => (photo.capturedAt ? Date.parse(photo.capturedAt) : Number.NaN))
    .filter((t) => Number.isFinite(t))
  if (times.length === 0) return null
  return Math.max(...times) - Math.min(...times)
}

const buildBurstCard = (
  group: SimilarReviewPhoto[],
  index: number,
): SimilarReviewCard => {
  const spanMs = computeTimeSpanMs(group)
  const spanLabel = spanMs == null ? 'sequence' : `${(spanMs / 1000).toFixed(spanMs < 10_000 ? 0 : 1)} seconds`
  return {
    id: `card-${index}`,
    kind: 'burst',
    photoIds: group.map((p) => p.id),
    confidence: spanMs != null && spanMs <= 5_000 ? 0.95 : 0.78,
    title: `Burst · ${group.length} photos · ${spanLabel}`,
    reason: 'Nearby captures within the active window.',
    fileNameRange: { first: group[0].fileName, last: group[group.length - 1].fileName },
    timeSpanMs: spanMs,
    capturedAt: group[0].capturedAt,
  }
}

const buildSameSceneCard = (
  group: SimilarReviewPhoto[],
  index: number,
): SimilarReviewCard => {
  const spanMs = computeTimeSpanMs(group)
  const spanLabel = spanMs == null ? 'sequence' : `${(spanMs / 1000).toFixed(0)} seconds`
  return {
    id: `card-${index}`,
    kind: 'same-scene',
    photoIds: group.map((p) => p.id),
    confidence: 0.6,
    title: `Same scene · ${group.length} photos · ${spanLabel}`,
    reason: 'Loose grouping within the active window.',
    fileNameRange: { first: group[0].fileName, last: group[group.length - 1].fileName },
    timeSpanMs: spanMs,
    capturedAt: group[0].capturedAt,
  }
}

const buildSingleCard = (
  photo: SimilarReviewPhoto,
  index: number,
): SimilarReviewCard => ({
  id: `card-${index}`,
  kind: 'same-scene',
  photoIds: [photo.id],
  confidence: 0.2,
  title: `Single · ${photo.fileName}`,
  reason: 'No nearby captures within the active window.',
  fileNameRange: { first: photo.fileName, last: photo.fileName },
  timeSpanMs: 0,
  capturedAt: photo.capturedAt,
})

export function buildSimilarReviewQueue(
  photos: SimilarReviewPhoto[],
  options: BuildSimilarReviewQueueOptions = {},
): SimilarReviewCard[] {
  if (photos.length === 0) return []
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS

  const sorted = sortPhotos(photos)
  const cards: SimilarReviewCard[] = []
  let group: SimilarReviewPhoto[] = []

  const flush = () => {
    if (group.length === 0) return
    if (group.length >= 2) {
      const spanMs = computeTimeSpanMs(group)
      const isTightBurst = spanMs != null && spanMs <= Math.min(5_000, windowMs)
      const card = isTightBurst || spanMs == null
        ? buildBurstCard(group, cards.length + 1)
        : buildSameSceneCard(group, cards.length + 1)
      cards.push(card)
    } else {
      cards.push(buildSingleCard(group[0], cards.length + 1))
    }
    group = []
  }

  for (const photo of sorted) {
    if (group.length === 0) {
      group.push(photo)
      continue
    }
    const previous = group[group.length - 1]
    if (closeByTime(previous, photo, windowMs) || closeByFilename(previous, photo)) {
      group.push(photo)
      continue
    }
    flush()
    group.push(photo)
  }
  flush()
  return cards
}
