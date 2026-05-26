import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, ZoomIn } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { TimelinePhoto } from '../../types/photos'
import type { SimilarReviewCard, SimilarReviewCardKind } from './similarReviewModel'

type Decision = 'keep' | 'discard'

type Props = {
  cards: SimilarReviewCard[]
  photosById: Map<string, TimelinePhoto>
  windowMs: number
  onWindowChange: (next: number) => void
  activeCardId: string | null
  onSelectCard: (cardId: string | null) => void
  selectedPhotoId: string | null
  onSelectPhoto: (photo: TimelinePhoto | null) => void
  selectionMode: boolean
  selectedIds: Set<string>
  onToggleSelectedId: (id: string) => void
  onClearSelection: () => void
  onZoomPhotos: (photos: TimelinePhoto[], initialIndex: number) => void
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

function Tile({
  photo,
  fileNameFallback,
  decision,
  isBest,
  selectionMode,
  isMultiSelected,
  isFocusSelected,
  onClick,
  onZoom,
  onKeep,
  onDiscard,
}: {
  photo: TimelinePhoto | undefined
  fileNameFallback: string
  decision: Decision
  isBest: boolean
  selectionMode: boolean
  isMultiSelected: boolean
  isFocusSelected: boolean
  onClick: () => void
  onZoom: () => void
  onKeep: () => void
  onDiscard: () => void
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
    'sr-tile',
    decision === 'discard' ? 'sr-tile--discard' : '',
    isBest && decision === 'keep' ? 'sr-tile--best' : '',
    isFocusSelected ? 'sr-tile--focused' : '',
    isMultiSelected ? 'sr-tile--multi-selected' : '',
    selectionMode ? 'sr-tile--selecting' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = photo?.fileName ?? fileNameFallback

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-pressed={isFocusSelected || isMultiSelected}
      aria-label={`Photo ${label}`}
    >
      <span className="sr-tile__media">
        {url && !failed ? (
          <img src={url} alt={label} onError={() => setFailed(true)} />
        ) : (
          <span className="sr-tile__fallback">{label}</span>
        )}
      </span>
      {decision === 'keep' && (
        <span className="sr-tile__decision-badge sr-tile__decision-badge--keep" aria-hidden>
          {isBest ? '★ Best' : 'Keep'}
        </span>
      )}
      {decision === 'discard' && (
        <span className="sr-tile__decision-badge sr-tile__decision-badge--discard" aria-hidden>
          Discard
        </span>
      )}
      {selectionMode && (
        <span
          className={`sr-tile__check${isMultiSelected ? ' sr-tile__check--on' : ''}`}
          aria-hidden
        >
          {isMultiSelected ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      )}
      <span className="sr-tile__overlay" aria-hidden>
        <span
          role="button"
          tabIndex={-1}
          className="sr-tile__overlay-btn"
          title="Zoom"
          onClick={(e) => {
            e.stopPropagation()
            onZoom()
          }}
        >
          <ZoomIn size={18} strokeWidth={2} />
        </span>
        <span
          role="button"
          tabIndex={-1}
          className="sr-tile__overlay-btn sr-tile__overlay-btn--keep"
          title="Keep"
          onClick={(e) => {
            e.stopPropagation()
            onKeep()
          }}
        >
          <Check size={18} strokeWidth={2.5} />
        </span>
        <span
          role="button"
          tabIndex={-1}
          className="sr-tile__overlay-btn sr-tile__overlay-btn--discard"
          title="Discard"
          onClick={(e) => {
            e.stopPropagation()
            onDiscard()
          }}
        >
          <X size={18} strokeWidth={2.5} />
        </span>
      </span>
      <span className="sr-tile__caption">
        <span className="sr-tile__filename">{label}</span>
        <span className="sr-tile__time">{formatSecond(photo?.capturedAt)}</span>
      </span>
    </button>
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

export function SimilarReviewView({
  cards,
  photosById,
  windowMs,
  onWindowChange,
  activeCardId,
  onSelectCard,
  selectedPhotoId,
  onSelectPhoto,
  selectionMode,
  selectedIds,
  onToggleSelectedId,
  onClearSelection,
  onZoomPhotos,
}: Props) {
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
  }, [cards])

  const activeCard = useMemo(
    () => cards.find((c) => c.id === activeCardId) ?? null,
    [cards, activeCardId],
  )

  const activeDecisions = activeCard
    ? (decisionsByCard[activeCard.id] ?? defaultDecisions(activeCard))
    : {}

  const setDecision = useCallback(
    (cardId: string, photoId: string, decision: Decision) => {
      setDecisionsByCard((prev) => {
        const card = cards.find((c) => c.id === cardId)
        if (!card) return prev
        return {
          ...prev,
          [cardId]: { ...(prev[cardId] ?? defaultDecisions(card)), [photoId]: decision },
        }
      })
    },
    [cards],
  )

  const setAllDecisions = (decision: Decision) => {
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
    onSelectCard(cards[next].id)
  }

  const applyBatchDecision = (decision: Decision) => {
    if (selectedIds.size === 0) return
    setDecisionsByCard((prev) => {
      const next = { ...prev }
      for (const card of cards) {
        let touched = false
        const updated = { ...(next[card.id] ?? defaultDecisions(card)) }
        for (const id of card.photoIds) {
          if (selectedIds.has(id)) {
            updated[id] = decision
            touched = true
          }
        }
        if (touched) next[card.id] = updated
      }
      return next
    })
  }

  const completedCount = useMemo(
    () =>
      cards.filter((c) => {
        const dec = decisionsByCard[c.id]
        return dec && c.photoIds.every((id) => dec[id] === 'keep' || dec[id] === 'discard')
      }).length,
    [cards, decisionsByCard],
  )

  const handleTileClick = (cardId: string, photoId: string) => {
    if (selectionMode) {
      onToggleSelectedId(photoId)
      return
    }
    onSelectCard(cardId)
    const photo = photosById.get(photoId)
    onSelectPhoto(photo ?? null)
  }

  const handleTileZoom = (cardPhotoIds: string[], photoId: string) => {
    const photos = cardPhotoIds
      .map((id) => photosById.get(id))
      .filter((p): p is TimelinePhoto => Boolean(p))
    const idx = Math.max(0, photos.findIndex((p) => p.id === photoId))
    if (photos.length === 0) return
    onZoomPhotos(photos, idx)
  }

  const activeIdx = activeCard ? cards.findIndex((c) => c.id === activeCard.id) : -1
  const selectedAcrossActive = activeCard
    ? activeCard.photoIds.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0)
    : 0

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
              const decided = dec
                ? card.photoIds.every((id) => dec[id] === 'keep' || dec[id] === 'discard')
                : false
              return (
                <button
                  type="button"
                  key={card.id}
                  className={`sr-queue__item${isActive ? ' sr-queue__item--active' : ''}`}
                  onClick={() => onSelectCard(card.id)}
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

          {selectionMode && (
            <div className="sr-batchbar" role="region" aria-label="Batch actions">
              <span className="sr-batchbar__count">
                {selectedIds.size} selected
                {activeCard && selectedAcrossActive > 0 ? ` · ${selectedAcrossActive} in this group` : ''}
              </span>
              <div className="sr-batchbar__actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={selectedIds.size === 0}
                  onClick={() => applyBatchDecision('keep')}
                >
                  <Check size={14} strokeWidth={2} /> Keep selected
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={selectedIds.size === 0}
                  onClick={() => applyBatchDecision('discard')}
                >
                  <X size={14} strokeWidth={2} /> Discard selected
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={selectedIds.size === 0}
                  onClick={onClearSelection}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </header>

        {!activeCard ? (
          <div className="sr-canvas__empty">
            <p>No similar groups in the current window. Try widening the time window above.</p>
          </div>
        ) : (
          <div className="sr-hero">
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

            <div
              className={`sr-hero__grid sr-hero__grid--cols-${Math.min(3, Math.max(1, activeCard.photoIds.length))}`}
            >
              {activeCard.photoIds.map((id, idx) => {
                const photo = photosById.get(id)
                const decision = activeDecisions[id] ?? 'keep'
                const isBest = idx === 0
                return (
                  <Tile
                    key={id}
                    photo={photo}
                    fileNameFallback={id}
                    decision={decision}
                    isBest={isBest}
                    selectionMode={selectionMode}
                    isMultiSelected={selectedIds.has(id)}
                    isFocusSelected={!selectionMode && selectedPhotoId === id}
                    onClick={() => handleTileClick(activeCard.id, id)}
                    onZoom={() => handleTileZoom(activeCard.photoIds, id)}
                    onKeep={() => setDecision(activeCard.id, id, 'keep')}
                    onDiscard={() => setDecision(activeCard.id, id, 'discard')}
                  />
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
                <button type="button" className="secondary-button" onClick={() => setAllDecisions('keep')}>
                  Keep all
                </button>
                <button type="button" className="secondary-button" onClick={() => setAllDecisions('discard')}>
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
        )}
      </section>
    </main>
  )
}
