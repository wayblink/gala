import { recommendHighestQualityPhotoId } from '../../domain/photoQuality'
import type { PhotoQualityScore } from '../../domain/photoQuality'

export type SimilarReviewCardKind = 'burst' | 'duplicate' | 'same-scene'

export type SimilarReviewCard = {
  id: string
  kind: SimilarReviewCardKind
  photoIds: string[]
  recommendedKeepPhotoId: string | null
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
  width?: number | null
  height?: number | null
  fileSize?: number | null
  isFavorite?: boolean
  isHidden?: boolean
  quality?: PhotoQualityScore | null
  sourceName: string
}

export type BuildSimilarReviewQueueOptions = {
  windowMs?: number
  /// Per-photo embedding lookup. Vectors are raw f32 arrays from the
  /// macOS Vision feature print. When supplied, the model also requires
  /// the cosine distance between consecutive photos in a time window to
  /// fall under `thresholdCosine` before they're merged into the same
  /// group. Photos missing an embedding fall back to time-only grouping
  /// (so the model degrades gracefully on libraries that haven't run
  /// photo.embed yet).
  embeddings?: Map<string, Float32Array>
  /// Maximum cosine distance between consecutive photos to keep them
  /// grouped. 0 = identical, 1 = orthogonal. RFC §9 documents 0.55 for
  /// faces; whole-photo feature print needs a tighter cut because the
  /// landscape itself dominates the signal — 0.30 is the V0 default.
  thresholdCosine?: number
}

export const DEFAULT_WINDOW_MS = 30_000
export const DEFAULT_THRESHOLD_COSINE = 0.30
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

/// Cosine distance = 1 - cosine similarity. Lower means more similar.
/// Returns null if either vector is missing or zero-length.
export function cosineDistance(a: Float32Array, b: Float32Array): number | null {
  if (!a || !b) return null
  if (a.length === 0 || b.length === 0) return null
  if (a.length !== b.length) return null
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (na === 0 || nb === 0) return null
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb))
}

const closeByEmbedding = (
  a: SimilarReviewPhoto,
  b: SimilarReviewPhoto,
  embeddings: Map<string, Float32Array> | undefined,
  thresholdCosine: number,
): { decided: boolean; close: boolean } => {
  // No embeddings supplied (or one of the photos is missing one) — let the
  // caller fall through to its time-only check. We don't want missing data
  // to look like a confident "different photo" verdict.
  if (!embeddings) return { decided: false, close: false }
  const va = embeddings.get(a.id)
  const vb = embeddings.get(b.id)
  if (!va || !vb) return { decided: false, close: false }
  const dist = cosineDistance(va, vb)
  if (dist === null) return { decided: false, close: false }
  return { decided: true, close: dist <= thresholdCosine }
}

const computeTimeSpanMs = (group: SimilarReviewPhoto[]): number | null => {
  const times = group
    .map((photo) => (photo.capturedAt ? Date.parse(photo.capturedAt) : Number.NaN))
    .filter((t) => Number.isFinite(t))
  if (times.length === 0) return null
  return Math.max(...times) - Math.min(...times)
}

export function recommendKeepPhotoId(group: SimilarReviewPhoto[]): string | null {
  return recommendHighestQualityPhotoId(group)
}

const buildBurstCard = (
  group: SimilarReviewPhoto[],
  index: number,
  embeddingsAvailable: boolean,
): SimilarReviewCard => {
  const spanMs = computeTimeSpanMs(group)
  const spanLabel = spanMs == null ? 'sequence' : `${(spanMs / 1000).toFixed(spanMs < 10_000 ? 0 : 1)} seconds`
  return {
    id: `card-${index}`,
    kind: 'burst',
    photoIds: group.map((p) => p.id),
    recommendedKeepPhotoId: recommendKeepPhotoId(group),
    confidence: spanMs != null && spanMs <= 5_000 ? 0.95 : 0.78,
    title: `Burst · ${group.length} photos · ${spanLabel}`,
    reason: embeddingsAvailable
      ? 'Nearby captures with matching scene.'
      : 'Nearby captures within the active window.',
    fileNameRange: { first: group[0].fileName, last: group[group.length - 1].fileName },
    timeSpanMs: spanMs,
    capturedAt: group[0].capturedAt,
  }
}

const buildSameSceneCard = (
  group: SimilarReviewPhoto[],
  index: number,
  embeddingsAvailable: boolean,
): SimilarReviewCard => {
  const spanMs = computeTimeSpanMs(group)
  const spanLabel = spanMs == null ? 'sequence' : `${(spanMs / 1000).toFixed(0)} seconds`
  return {
    id: `card-${index}`,
    kind: 'same-scene',
    photoIds: group.map((p) => p.id),
    recommendedKeepPhotoId: recommendKeepPhotoId(group),
    confidence: embeddingsAvailable ? 0.75 : 0.6,
    title: `Same scene · ${group.length} photos · ${spanLabel}`,
    reason: embeddingsAvailable
      ? 'Visually similar within the active window.'
      : 'Loose grouping within the active window.',
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
  recommendedKeepPhotoId: photo.id,
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
  const thresholdCosine = options.thresholdCosine ?? DEFAULT_THRESHOLD_COSINE
  const embeddings = options.embeddings
  const embeddingsAvailable = !!embeddings && embeddings.size > 0

  const sorted = sortPhotos(photos)
  const cards: SimilarReviewCard[] = []
  let group: SimilarReviewPhoto[] = []

  const flush = () => {
    if (group.length === 0) return
    if (group.length >= 2) {
      const spanMs = computeTimeSpanMs(group)
      const isTightBurst = spanMs != null && spanMs <= Math.min(5_000, windowMs)
      const card = isTightBurst || spanMs == null
        ? buildBurstCard(group, cards.length + 1, embeddingsAvailable)
        : buildSameSceneCard(group, cards.length + 1, embeddingsAvailable)
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
    const timeOrFilename =
      closeByTime(previous, photo, windowMs) || closeByFilename(previous, photo)
    if (!timeOrFilename) {
      flush()
      group.push(photo)
      continue
    }
    // Time/filename says "could be similar". Check the visual signal too
    // when we have it: an embedding decision overrides the time hint.
    // Missing embeddings → fall through to time-only behaviour (safe
    // pre-M2 default).
    const embedDecision = closeByEmbedding(previous, photo, embeddings, thresholdCosine)
    if (embedDecision.decided && !embedDecision.close) {
      flush()
      group.push(photo)
      continue
    }
    group.push(photo)
  }
  flush()
  return cards
}
