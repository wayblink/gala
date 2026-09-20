import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, X, ZoomIn } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { computePhotoQualityScore } from '../../domain/photoQuality'
import type { TimelinePhoto } from '../../types/photos'
import type { SimilarReviewCard, SimilarReviewCardKind } from './similarReviewModel'

type Decision = 'keep' | 'discard'

type Props = {
  cards: SimilarReviewCard[]
  photosById: Map<string, TimelinePhoto>
  activeCardId: string | null
  onSelectCard: (cardId: string | null) => void
  selectedPhotoId: string | null
  onSelectPhoto: (photo: TimelinePhoto | null) => void
  selectionMode: boolean
  selectedIds: Set<string>
  onToggleSelectedId: (id: string) => void
  onClearSelection: () => void
  onZoomPhotos: (photos: TimelinePhoto[], initialIndex: number) => void
  // M2.2 — embedding progress + threshold control
  embeddingStats?: { total: number; embedded: number }
  thresholdCosine?: number
  onThresholdChange?: (next: number) => void
  onRunPhotoEmbed?: () => void | Promise<void>
  embeddingsLoaded: boolean
  embeddingsBusy?: boolean
  onApplyDecisions?: (decisions: Record<string, Decision>) => Promise<void>
  decisionsBusy?: boolean
  showQuality?: boolean
}


function useScrollThumb<T extends HTMLElement>(deps: React.DependencyList = []) {
  const ref = useRef<T | null>(null)
  const [thumb, setThumb] = useState({ visible: false, top: 0, height: 0 })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 2) {
      setThumb({ visible: false, top: 0, height: 0 })
      return
    }
    const height = Math.max(36, Math.round((el.clientHeight / el.scrollHeight) * el.clientHeight))
    const viewportTop = Math.round((el.scrollTop / maxScroll) * (el.clientHeight - height))
    setThumb({ visible: true, top: el.scrollTop + viewportTop, height })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    const Observer = typeof ResizeObserver === 'undefined' ? null : ResizeObserver
    const observer = Observer ? new Observer(scheduleUpdate) : null
    observer?.observe(el)
    return () => {
      window.cancelAnimationFrame(raf)
      el.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      observer?.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, ...deps])

  return { ref, thumb }
}

function ScrollThumb({ visible, top, height }: { visible: boolean; top: number; height: number }) {
  if (!visible) return null
  return (
    <span
      className="sr-custom-scrollbar"
      aria-hidden="true"
      style={{ top, height }}
    />
  )
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
  selectionMode,
  isMultiSelected,
  isFocusSelected,
  isRecommended,
  showQuality,
  onClick,
  onZoom,
  onKeep,
  onDiscard,
}: {
  photo: TimelinePhoto | undefined
  fileNameFallback: string
  decision: Decision | undefined
  selectionMode: boolean
  isMultiSelected: boolean
  isFocusSelected: boolean
  isRecommended: boolean
  showQuality: boolean
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
    decision === 'keep' ? 'sr-tile--keep' : '',
    decision === 'discard' ? 'sr-tile--discard' : '',
    isFocusSelected ? 'sr-tile--focused' : '',
    isMultiSelected ? 'sr-tile--multi-selected' : '',
    selectionMode ? 'sr-tile--selecting' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = photo?.fileName ?? fileNameFallback
  const quality = showQuality && photo ? computePhotoQualityScore(photo) : null

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
      {quality && (
        <span className={`sr-tile__quality sr-tile__quality--${quality.label}`}>
          {quality.score}
        </span>
      )}
      {isRecommended && (
        <span className="sr-tile__recommendation">
          Recommended
        </span>
      )}
      {decision === 'keep' && (
        <span className="sr-tile__decision-badge sr-tile__decision-badge--keep" aria-hidden>
          Keep
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
  activeCardId,
  onSelectCard,
  selectedPhotoId,
  onSelectPhoto,
  selectionMode,
  selectedIds,
  onToggleSelectedId,
  onClearSelection,
  onZoomPhotos,
  embeddingStats,
  thresholdCosine,
  onThresholdChange,
  onRunPhotoEmbed,
  embeddingsLoaded,
  embeddingsBusy,
  onApplyDecisions,
  decisionsBusy,
  showQuality = false,
}: Props) {
  const [decisionsByCard, setDecisionsByCard] = useState<Record<string, Record<string, Decision>>>(
    () => Object.fromEntries(cards.map((c) => [c.id, {}])),
  )

  useEffect(() => {
    setDecisionsByCard((prev) => {
      const next = { ...prev }
      let dirty = false
      for (const card of cards) {
        if (!next[card.id]) {
          next[card.id] = {}
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

  const activeDecisions = activeCard ? (decisionsByCard[activeCard.id] ?? {}) : {}

  const setDecision = useCallback((cardId: string, photoId: string, decision: Decision) => {
    setDecisionsByCard((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? {}), [photoId]: decision },
    }))
  }, [])

  const setAllDecisions = (decision: Decision) => {
    if (!activeCard) return
    const next: Record<string, Decision> = {}
    activeCard.photoIds.forEach((id) => {
      next[id] = decision
    })
    setDecisionsByCard((prev) => ({ ...prev, [activeCard.id]: next }))
  }

  const applyRecommendation = () => {
    if (!activeCard?.recommendedKeepPhotoId) return
    const next: Record<string, Decision> = {}
    activeCard.photoIds.forEach((id) => {
      next[id] = id === activeCard.recommendedKeepPhotoId ? 'keep' : 'discard'
    })
    setDecisionsByCard((prev) => ({ ...prev, [activeCard.id]: next }))
  }

  const applyActiveDecisions = async () => {
    if (!activeCard || !onApplyDecisions) {
      advance(1)
      return
    }
    const decisions = decisionsByCard[activeCard.id] ?? {}
    const decided = activeCard.photoIds.some((id) => decisions[id] === 'keep' || decisions[id] === 'discard')
    if (decided) {
      await onApplyDecisions(decisions)
    }
    advance(1)
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
        const updated = { ...(next[card.id] ?? {}) }
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
  const hasNextCard = activeIdx >= 0 && activeIdx < cards.length - 1
  const selectedAcrossActive = activeCard
    ? activeCard.photoIds.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0)
    : 0
  const queueScroll = useScrollThumb<HTMLElement>([cards.length])
  const canvasScroll = useScrollThumb<HTMLElement>([activeCardId, cards.length])
  const activeRecommendation = activeCard?.recommendedKeepPhotoId
    ? photosById.get(activeCard.recommendedKeepPhotoId)
    : null
  const activeRecommendationQuality = showQuality && activeRecommendation ? computePhotoQualityScore(activeRecommendation) : null

  return (
    <main className="similar-review-view" aria-label="Similar review workflow">
      <aside className="sr-queue" aria-label="Review queue" ref={queueScroll.ref}>
        <ScrollThumb {...queueScroll.thumb} />
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

      <section className="sr-canvas" ref={canvasScroll.ref}>
        <ScrollThumb {...canvasScroll.thumb} />
        <header className="sr-canvas__head">
          <p className="sr-canvas__eyebrow">Workflow</p>
          <h1>Similar Review</h1>
          <span className="sr-canvas__summary">{cards.length} groups · {completedCount} decided</span>
          <div className="sr-canvas__embed-bar">
            <span className="sr-canvas__embed-status">
              {embeddingsLoaded
                ? `Visual similarity ON · ${embeddingStats?.embedded ?? 0}/${embeddingStats?.total ?? 0} photos embedded`
                : embeddingStats && embeddingStats.embedded > 0
                  ? `Visual similarity available · ${embeddingStats.embedded}/${embeddingStats.total}`
                  : 'Visual similarity off — falling back to time + filename only'}
            </span>
            {onRunPhotoEmbed && (
              <button
                className="sr-canvas__embed-btn"
                type="button"
                onClick={() => void onRunPhotoEmbed()}
                disabled={embeddingsBusy}
                title="Generate full-image embeddings via macOS Vision"
              >
                {embeddingsBusy ? 'Embedding…' : 'Embed photos'}
              </button>
            )}
            {embeddingsLoaded && onThresholdChange && (
              <label className="sr-canvas__threshold">
                <span>Visual threshold</span>
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  value={thresholdCosine ?? 0.3}
                  onChange={(e) => onThresholdChange(Number(e.target.value))}
                />
                <span className="sr-canvas__threshold-value">
                  {(thresholdCosine ?? 0.3).toFixed(2)}
                </span>
              </label>
            )}
          </div>
          <span className="sr-canvas__crumb">
            {activeCard ? `Group ${activeIdx + 1} of ${cards.length}` : 'No active group'}
          </span>

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
            {activeRecommendation && activeRecommendationQuality && (
              <div className="sr-quality-callout" aria-label="Recommended keeper">
                <div>
                  <span className="sr-quality-callout__label">Quality recommendation</span>
                  <strong>{activeRecommendation.fileName}</strong>
                  <span>
                    Score {activeRecommendationQuality.score} ·{' '}
                    {activeRecommendationQuality.reasons.slice(0, 3).join(' · ')}
                  </span>
                </div>
                <button type="button" className="secondary-button" onClick={applyRecommendation}>
                  Use recommendation
                </button>
              </div>
            )}

            <div
              className={`sr-hero__grid sr-hero__grid--cols-${Math.min(3, Math.max(1, activeCard.photoIds.length))}`}
            >
              {activeCard.photoIds.map((id) => {
                const photo = photosById.get(id)
                const decision = activeDecisions[id]
                return (
                  <Tile
                    key={id}
                    photo={photo}
                    fileNameFallback={id}
                    decision={decision}
                    selectionMode={selectionMode}
                    isMultiSelected={selectedIds.has(id)}
                    isFocusSelected={!selectionMode && selectedPhotoId === id}
                    isRecommended={activeCard.recommendedKeepPhotoId === id}
                    showQuality={showQuality}
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
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => void applyActiveDecisions()}
                disabled={decisionsBusy}
              >
                {decisionsBusy ? 'Applying...' : hasNextCard ? 'Apply & Next ->' : 'Apply'}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
