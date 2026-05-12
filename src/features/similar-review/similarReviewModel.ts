export type SimilarReviewCardKind = 'burst' | 'duplicate' | 'same-scene'

export type SimilarReviewCard = {
  id: string
  kind: SimilarReviewCardKind
  photoIds: string[]
  confidence: number
  title: string
  reason: string
}

type SimilarReviewPhoto = {
  id: string
  fileName: string
  capturedAt: string | null
  sourceName: string
}

const BURST_WINDOW_MS = 5_000

export function buildSimilarReviewQueue(photos: SimilarReviewPhoto[]): SimilarReviewCard[] {
  if (photos.length === 0) {
    return []
  }

  const sorted = [...photos].sort((a, b) => {
    const aTime = a.capturedAt ? Date.parse(a.capturedAt) : Number.POSITIVE_INFINITY
    const bTime = b.capturedAt ? Date.parse(b.capturedAt) : Number.POSITIVE_INFINITY
    return aTime - bTime || a.id.localeCompare(b.id)
  })

  const cards: SimilarReviewCard[] = []
  let burst: SimilarReviewPhoto[] = []

  const flushBurst = () => {
    if (burst.length === 0) return

    if (burst.length >= 2) {
      cards.push({
        id: `card-${cards.length + 1}`,
        kind: 'burst',
        photoIds: burst.map((photo) => photo.id),
        confidence: 0.95,
        title: `Burst review · ${burst.length} photos`,
        reason: 'Nearby captures within a short time window.',
      })
    } else {
      const [photo] = burst
      cards.push({
        id: `card-${cards.length + 1}`,
        kind: 'same-scene',
        photoIds: [photo.id],
        confidence: 0.2,
        title: `Single capture · ${photo.fileName}`,
        reason: 'No nearby captures found.',
      })
    }

    burst = []
  }

  for (const photo of sorted) {
    if (burst.length === 0) {
      burst.push(photo)
      continue
    }

    const previous = burst[burst.length - 1]
    const previousTime = previous.capturedAt ? Date.parse(previous.capturedAt) : Number.NaN
    const currentTime = photo.capturedAt ? Date.parse(photo.capturedAt) : Number.NaN
    const withinBurstWindow = Number.isFinite(previousTime) && Number.isFinite(currentTime)
      ? Math.abs(currentTime - previousTime) <= BURST_WINDOW_MS
      : false

    if (withinBurstWindow) {
      burst.push(photo)
      continue
    }

    flushBurst()
    burst.push(photo)
  }

  flushBurst()
  return cards
}
