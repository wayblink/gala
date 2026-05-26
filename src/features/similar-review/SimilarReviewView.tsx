import { useEffect, useMemo, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { TimelinePhoto } from '../../types/photos'
import type { SimilarReviewCard, SimilarReviewCardKind } from './similarReviewModel'

type Decision = 'keep' | 'discard'

type Props = {
  cards: SimilarReviewCard[]
  photosById: Map<string, TimelinePhoto>
  windowMs: number
  onWindowChange: (next: number) => void
}

const WINDOW_PRESETS = [1_000, 5_000, 10_000, 30_000, 60_000, 300_000]
const MIN_WINDOW_MS = 1_000
const MAX_WINDOW_MS = 300_000

function formatWindow(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`
  return `${Math.round(ms / 60_000)} min`
}

function formatSpan(spanMs: number | null): string {
  if (spanMs == null) return 'sequence'
  if (spanMs < 60_000) return `${Math.max(1, Math.round(spanMs / 1_000))} s`
  return `${(spanMs / 60_000).toFixed(1)} min`
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatSecond(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function totalSize(ids: string[], byId: Map<string, TimelinePhoto>): string {
  const bytes = ids.reduce((acc, id) => acc + (byId.get(id)?.fileSize ?? 0), 0)
  if (bytes === 0) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function defaultDecisions(card: SimilarReviewCard): Record<string, Decision> {
  const next: Record<string, Decision> = {}
  card.photoIds.forEach((id, idx) => {
    if (card.kind === 'burst' && card.photoIds.length > 1) {
      next[id] = idx === 0 ? 'keep' : 'discard'
    } else {
      next[id] = 'keep'
    }
  })
  return next
}

function badgeLabel(kind: SimilarReviewCardKind): string {
  if (kind === 'burst') return 'Burst'
  if (kind === 'duplicate') return 'Duplicate'
  return 'Same scene'
}

function badgeClass(kind: SimilarReviewCardKind): string {
  if (kind === 'burst') return 'sr-badge sr-badge--burst'
  if (kind === 'duplicate') return 'sr-badge sr-badge--duplicate'
  return 'sr-badge sr-badge--scene'
}

function Thumbnail({
  photo,
  decision,
  isBest,
}: {
  photo: TimelinePhoto | undefined
  decision: Decision | undefined
  isBest: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!photo?.thumbnailPath) {
      setUrl(null)
      return
    }
    try {
      setUrl(convertFileSrc(photo.thumbnailPath))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [photo?.thumbnailPath])
  const className = [
    'sr-hero__photo',
    isBest ? 'sr-hero__photo--best' : '',
    decision === 'discard' ? 'sr-hero__photo--discard' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      {url && !failed ? (
        <img src={url} alt={photo?.fileName ?? ''} onError={() => setFailed(true)} />
      ) : (
        <span className="sr-hero__photo-fallback">{photo?.fileName ?? '—'}</span>
      )}
    </div>
  )
}

function QueueThumbnail({ photo }: { photo: TimelinePhoto | undefined }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!photo?.thumbnailPath) {
      setUrl(null)
      return
    }
    try {
      setUrl(convertFileSrc(photo.thumbnailPath))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [photo?.thumbnailPath])
  return (
    <div className="sr-queue__thumb">
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="sr-queue__thumb-fallback" />
      )}
    </div>
  )
}

export function SimilarReviewView({ cards, photosById, windowMs, onWindowChange }: Props) {
  const [activeCardId, setActiveCardId] = useState<string | null>(cards[0]?.id ?? null)
  const [decisionsByCard, setDecisionsByCard] = useState<Record<string, Record<string, Decision>>>(
    () => Object.fromEntries(cards.map((c) => [c.id, defaultDecisions(c)])),
  )

  useEffect(() => {
    setDecisionsByCard((prev) => {
      const next = { ...prev }
      let dirty = false
      for (const card of cards) {
        if (!next[card.id]) {
          next[card.id] = defaultDecisions(card)
          dirty = true
        }
      }
      return dirty ? next : prev
    })
    if (cards.length === 0) {
      setActiveCardId(null)
      return
    }
    if (!activeCardId || !cards.some((c) => c.id === activeCardId)) {
      setActiveCardId(cards[0].id)
    }
  }, [cards, activeCardId])

  const activeCard = useMemo(
    () => cards.find((c) => c.id === activeCardId) ?? null,
    [cards, activeCardId],
  )

  const activeDecisions = activeCard ? (decisionsByCard[activeCard.id] ?? defaultDecisions(activeCard)) : {}

  const setDecision = (photoId: string, decision: Decision) => {
    if (!activeCard) return
    setDecisionsByCard((prev) => ({
      ...prev,
      [activeCard.id]: { ...(prev[activeCard.id] ?? defaultDecisions(activeCard)), [photoId]: decision },
    }))
  }

  const setAll = (decision: Decision) => {
    if (!activeCard) return
    const next: Record<string, Decision> = {}
    activeCard.photoIds.forEach((id) => {
      next[id] = decision
    })
    setDecisionsByCard((prev) => ({ ...prev, [activeCard.id]: next }))
  }

  const keepBest = () => {
    if (!activeCard) return
    const next: Record<string, Decision> = {}
    activeCard.photoIds.forEach((id, idx) => {
      next[id] = idx === 0 ? 'keep' : 'discard'
    })
    setDecisionsByCard((prev) => ({ ...prev, [activeCard.id]: next }))
  }

  const advance = (delta: number) => {
    if (cards.length === 0 || !activeCard) return
    const idx = cards.findIndex((c) => c.id === activeCard.id)
    const next = Math.min(cards.length - 1, Math.max(0, idx + delta))
    setActiveCardId(cards[next].id)
  }

  const completedCount = useMemo(
    () =>
      cards.filter((c) => {
        const dec = decisionsByCard[c.id]
        return dec && c.photoIds.every((id) => dec[id] === 'keep' || dec[id] === 'discard')
      }).length,
    [cards, decisionsByCard],
  )

  const heroPhotos = activeCard?.photoIds.map((id) => photosById.get(id)) ?? []
  const inspectorPhoto = heroPhotos[0]
  const activeIdx = activeCard ? cards.findIndex((c) => c.id === activeCard.id) : -1

  return (
    <main className="similar-review-view" aria-label="Similar review workflow">
      <aside className="sr-queue" aria-label="Review queue">
        <div className="sr-queue__head">
          <span className="sr-queue__title">Review queue</span>
          <span className="sr-queue__count">{cards.length}</span>
        </div>
        {cards.length === 0 ? (
          <p className="sr-queue__empty">No similar groups yet. Add photos or widen the window.</p>
        ) : (
          <div className="sr-queue__list">
            {cards.map((card) => {
              const firstPhoto = photosById.get(card.photoIds[0])
              const isActive = card.id === activeCardId
              const dec = decisionsByCard[card.id]
              const decided = dec ? card.photoIds.every((id) => dec[id] === 'keep' || dec[id] === 'discard') : false
              return (
                <button
                  type="button"
                  key={card.id}
                  className={`sr-queue__item${isActive ? ' sr-queue__item--active' : ''}`}
                  onClick={() => setActiveCardId(card.id)}
                  aria-pressed={isActive}
                >
                  <QueueThumbnail photo={firstPhoto} />
                  <span className="sr-queue__meta">
                    <span className="sr-queue__meta-title">
                      {badgeLabel(card.kind)} · {card.photoIds.length} photo
                      {card.photoIds.length === 1 ? '' : 's'}
                    </span>
                    <span className="sr-queue__meta-sub">
                      {formatClock(card.capturedAt) || 'no time'} · {formatSpan(card.timeSpanMs)}
                    </span>
                    <span className="sr-queue__progress">
                      <span
                        className="sr-queue__progress-fill"
                        style={{ width: `${decided ? 100 : 0}%` }}
                      />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </aside>

      <section className="sr-canvas">
        <header className="sr-canvas__head">
          <p className="sr-canvas__eyebrow">Workflow</p>
          <h1>Similar Review</h1>
          <p className="sr-canvas__sub">
            Review candidate groups before they become durable logical groups. {cards.length} groups,{' '}
            {completedCount} decided.
          </p>
          <div className="sr-canvas__toolbar">
            <label className="sr-slider">
              <span className="sr-slider__label">Group window</span>
              <input
                type="range"
                min={MIN_WINDOW_MS}
                max={MAX_WINDOW_MS}
                step={1_000}
                value={Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, windowMs))}
                onChange={(e) => onWindowChange(Number.parseInt(e.target.value, 10))}
                aria-label="Group window in milliseconds"
              />
              <span className="sr-slider__value">{formatWindow(windowMs)}</span>
              <span className="sr-slider__presets">
                {WINDOW_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={`sr-slider__preset${preset === windowMs ? ' sr-slider__preset--active' : ''}`}
                    onClick={() => onWindowChange(preset)}
                  >
                    {formatWindow(preset)}
                  </button>
                ))}
              </span>
            </label>
            <span className="sr-canvas__crumb">
              {activeCard ? `Group ${activeIdx + 1} of ${cards.length}` : 'No active group'}
            </span>
          </div>
        </header>

        {!activeCard ? (
          <div className="sr-canvas__empty">
            <p>No similar groups in the current window. Try widening the time window above.</p>
          </div>
        ) : (
          <div className="sr-hero">
            <div className="sr-hero__main">
              <div className="sr-hero__title-row">
                <span className={badgeClass(activeCard.kind)}>{badgeLabel(activeCard.kind)}</span>
                <h2 className="sr-hero__title">
                  {badgeLabel(activeCard.kind)} at {formatClock(activeCard.capturedAt) || 'unknown time'}
                </h2>
              </div>
              <p className="sr-hero__sub">
                {activeCard.photoIds.length} photos · {formatSpan(activeCard.timeSpanMs)} ·{' '}
                {activeCard.fileNameRange.first} → {activeCard.fileNameRange.last}
              </p>

              <div className={`sr-hero__grid sr-hero__grid--cols-${Math.min(3, Math.max(1, heroPhotos.length))}`}>
                {activeCard.photoIds.map((id, idx) => {
                  const photo = photosById.get(id)
                  const decision = activeDecisions[id] ?? 'keep'
                  const isBest = idx === 0 && decision === 'keep'
                  return (
                    <div className="sr-hero__tile" key={id}>
                      <Thumbnail photo={photo} decision={decision} isBest={isBest} />
                      <div
                        className="sr-toggle"
                        role="radiogroup"
                        aria-label={`Decision for ${photo?.fileName ?? id}`}
                      >
                        <button
                          type="button"
                          className={`sr-toggle__opt${decision === 'keep' ? ' sr-toggle__opt--keep' : ''}`}
                          aria-pressed={decision === 'keep'}
                          onClick={() => setDecision(id, 'keep')}
                        >
                          {isBest ? '★ Best' : 'Keep'}
                        </button>
                        <button
                          type="button"
                          className={`sr-toggle__opt${decision === 'discard' ? ' sr-toggle__opt--discard' : ''}`}
                          aria-pressed={decision === 'discard'}
                          onClick={() => setDecision(id, 'discard')}
                        >
                          Discard
                        </button>
                      </div>
                      <div className="sr-hero__caption">
                        <span>{photo?.fileName ?? id}</span>
                        <span>{formatSecond(photo?.capturedAt)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="sr-hero__actions">
                <div className="sr-hero__actions-left">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => advance(-1)}
                    disabled={activeIdx <= 0}
                  >
                    ← Previous
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setAll('keep')}>
                    Keep all
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setAll('discard')}>
                    Discard all
                  </button>
                  <button type="button" className="secondary-button" onClick={keepBest}>
                    Keep best
                  </button>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => advance(1)}
                  disabled={activeIdx >= cards.length - 1}
                >
                  Apply &amp; Next →
                </button>
              </div>
            </div>

            <aside className="sr-inspector" aria-label="Group details">
              <h3>Inspector</h3>
              <dl className="sr-inspector__list">
                <div>
                  <dt>Camera</dt>
                  <dd>{inspectorPhoto?.cameraModel ?? inspectorPhoto?.cameraMake ?? '—'}</dd>
                </div>
                <div>
                  <dt>Lens</dt>
                  <dd>{inspectorPhoto?.lensModel ?? '—'}</dd>
                </div>
                <div>
                  <dt>Captured</dt>
                  <dd>{formatSecond(activeCard.capturedAt) || '—'}</dd>
                </div>
                <div>
                  <dt>Time span</dt>
                  <dd>{formatSpan(activeCard.timeSpanMs)}</dd>
                </div>
                <div>
                  <dt>Total size</dt>
                  <dd>{totalSize(activeCard.photoIds, photosById)}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>
                    {activeCard.confidence.toFixed(2)} {badgeLabel(activeCard.kind).toLowerCase()}
                  </dd>
                </div>
              </dl>
              <div className="sr-inspector__files">
                <span className="sr-inspector__files-label">Files</span>
                <div className="sr-inspector__file-list">
                  {activeCard.photoIds.map((id) => (
                    <span key={id} className="sr-inspector__file">
                      {photosById.get(id)?.fileName ?? id}
                    </span>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
