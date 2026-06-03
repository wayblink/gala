import { useEffect, useMemo, useState } from 'react'
import {
  analysisEmbedPhotos,
  photoEmbeddingsByIds,
  photoEmbeddingsSummary,
  readArtifactBytes,
} from '../../desktop/capability'
import { getTimelinePhotos } from '../../desktop/photos'
import type { RunBackgroundTask } from '../../types/backgroundTasks'
import type { TimelinePhoto } from '../../types/photos'
import {
  buildSimilarReviewQueue,
  DEFAULT_THRESHOLD_COSINE,
  DEFAULT_WINDOW_MS,
} from './similarReviewModel'

type SimilarReviewViewerState = {
  photos: TimelinePhoto[]
  index: number
}

type UseSimilarReviewWorkflowOptions = {
  selected: boolean
  runBackgroundTask: RunBackgroundTask
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes > 0) return `${Math.round(bytes / 1024)} KB`
  return '-'
}

function formatSpan(spanMs: number | null): string {
  if (spanMs == null) return 'sequence'
  if (spanMs < 60_000) return `${Math.max(1, Math.round(spanMs / 1_000))} s`
  return `${(spanMs / 60_000).toFixed(1)} min`
}

export function useSimilarReviewWorkflow({
  selected,
  runBackgroundTask,
}: UseSimilarReviewWorkflowOptions) {
  const [photos, setPhotos] = useState<TimelinePhoto[]>([])
  const [windowMs, setWindowMs] = useState<number>(DEFAULT_WINDOW_MS)
  const [thresholdCosine, setThresholdCosine] = useState<number>(DEFAULT_THRESHOLD_COSINE)
  const [embeddings, setEmbeddings] = useState<Map<string, Float32Array>>(() => new Map())
  const [embeddingStats, setEmbeddingStats] = useState<{ total: number; embedded: number }>({
    total: 0,
    embedded: 0,
  })
  const [embeddingsBusy, setEmbeddingsBusy] = useState(false)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [viewerState, setViewerState] = useState<SimilarReviewViewerState | null>(null)

  const loadEmbeddings = async (photoIds: string[]) => {
    if (photoIds.length === 0) {
      setEmbeddings(new Map())
      return
    }

    try {
      const rows = await photoEmbeddingsByIds(photoIds)
      const next = new Map<string, Float32Array>()
      for (const row of rows) {
        try {
          const buffer = await readArtifactBytes(row.embedding_path)
          if (buffer.byteLength === row.dimensions * 4) {
            next.set(row.photo_id, new Float32Array(buffer))
          }
        } catch (err) {
          console.warn('[similar-review] embedding read failed:', row.photo_id, err)
        }
      }
      setEmbeddings(next)
    } catch (err) {
      console.warn('[similar-review] embeddings fetch failed:', err)
      setEmbeddings(new Map())
    }
  }

  const refresh = async () => {
    const nextPhotos = await getTimelinePhotos(100, 0)
    setPhotos(nextPhotos)
    await loadEmbeddings(nextPhotos.map((photo) => photo.id))
    try {
      setEmbeddingStats(await photoEmbeddingsSummary())
    } catch {
      /* ignore */
    }
    return nextPhotos
  }

  const runPhotoEmbeddingScan = async () => {
    setEmbeddingsBusy(true)
    try {
      await runBackgroundTask(
        {
          kind: 'similar',
          title: 'Scan Similar visual embeddings',
          description: 'Generate full-photo embeddings used by Similar Review',
          operationPayload: { command: 'analysisEmbedPhotos', limit: null, force: false },
        },
        async (update) => {
          update({ progressLabel: 'Generating embeddings...' })
          const result = await analysisEmbedPhotos()
          update({
            result: `${result.photos_embedded} embedded · ${result.photos_failed} failed · ${result.photos_skipped} skipped`,
          })
          return result
        },
      )

      setEmbeddingStats(await photoEmbeddingsSummary())
      const currentPhotos = photos.length > 0 ? photos : await getTimelinePhotos(100, 0)
      if (photos.length === 0) setPhotos(currentPhotos)
      await loadEmbeddings(currentPhotos.map((photo) => photo.id))
    } catch (err) {
      console.warn('[similar-review] embed run failed:', err)
    } finally {
      setEmbeddingsBusy(false)
    }
  }

  const cards = useMemo(
    () => buildSimilarReviewQueue(photos, {
      windowMs,
      embeddings: embeddings.size > 0 ? embeddings : undefined,
      thresholdCosine,
    }),
    [photos, windowMs, embeddings, thresholdCosine],
  )
  const photosById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos])
  const activeCard = useMemo(() => {
    if (cards.length === 0) return null
    return cards.find((card) => card.id === activeCardId) ?? cards[0]
  }, [cards, activeCardId])

  useEffect(() => {
    if (!selected) return
    const expected = activeCard?.id ?? null
    if (expected !== activeCardId) setActiveCardId(expected)
  }, [selected, activeCard, activeCardId])

  const inspector = selected
    ? (() => {
        if (!activeCard) {
          return (
            <section>
              <p className="eyebrow">Similar Review</p>
              <p className="mono-muted">No active group. Widen the time window or scan a source.</p>
            </section>
          )
        }

        const firstPhoto = photosById.get(activeCard.photoIds[0])
        const totalBytes = activeCard.photoIds.reduce(
          (acc, id) => acc + (photosById.get(id)?.fileSize ?? 0),
          0,
        )

        return (
          <section className="sr-cp-inspector">
            <p className="eyebrow">Group Inspector</p>
            <h3 className="cp-photo-name">{activeCard.title}</h3>
            <p className="cp-photo-date">
              {activeCard.fileNameRange.first} → {activeCard.fileNameRange.last}
            </p>
            <dl className="metadata-list" aria-label="Group metadata">
              <div>
                <dt>Kind</dt>
                <dd>{activeCard.kind}</dd>
              </div>
              <div>
                <dt>Photos</dt>
                <dd>{activeCard.photoIds.length}</dd>
              </div>
              <div>
                <dt>Time span</dt>
                <dd>{formatSpan(activeCard.timeSpanMs)}</dd>
              </div>
              <div>
                <dt>Captured</dt>
                <dd>
                  {activeCard.capturedAt
                    ? new Date(activeCard.capturedAt).toLocaleString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '-'}
                </dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{firstPhoto?.cameraModel ?? firstPhoto?.cameraMake ?? '-'}</dd>
              </div>
              <div>
                <dt>Lens</dt>
                <dd>{firstPhoto?.lensModel ?? '-'}</dd>
              </div>
              <div>
                <dt>Total size</dt>
                <dd>{formatBytes(totalBytes)}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{activeCard.confidence.toFixed(2)}</dd>
              </div>
            </dl>
          </section>
        )
      })()
    : undefined

  return {
    activeCard,
    cards,
    embeddingStats,
    embeddingsBusy,
    embeddingsLoaded: embeddings.size > 0,
    inspector,
    photosById,
    refresh,
    runPhotoEmbeddingScan,
    setActiveCardId,
    setThresholdCosine,
    setViewerState,
    setWindowMs,
    thresholdCosine,
    viewerState,
    windowMs,
  }
}
