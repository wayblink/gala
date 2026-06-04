import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TimelinePhoto } from '../../types/photos'
import type { SimilarReviewCard } from './similarReviewModel'
import { SimilarReviewView } from './SimilarReviewView'

const photo = (id: string, fileName: string): TimelinePhoto => ({
  id,
  fileName,
  relativePath: fileName,
  folderPath: '',
  capturedAt: '2026-01-01T10:00:00Z',
  width: 100,
  height: 100,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  gpsLatitude: null,
  gpsLongitude: null,
  fileSize: 1024,
  sourceName: 'Test source',
  sourceStatus: 'indexed',
  thumbnailPath: null,
  isFavorite: false,
  isHidden: false,
  tags: [],
})

describe('SimilarReviewView', () => {
  it('applies keep and discard decisions for the active group', async () => {
    const photos = [photo('p1', 'IMG_0001.jpg'), photo('p2', 'IMG_0002.jpg')]
    const photosById = new Map(photos.map((p) => [p.id, p]))
    const card: SimilarReviewCard = {
      id: 'card-1',
      kind: 'burst',
      photoIds: ['p1', 'p2'],
      recommendedKeepPhotoId: 'p1',
      confidence: 0.92,
      title: 'Burst · 2 photos · 1 seconds',
      reason: 'Nearby captures within the active window.',
      fileNameRange: { first: 'IMG_0001.jpg', last: 'IMG_0002.jpg' },
      timeSpanMs: 1_000,
      capturedAt: '2026-01-01T10:00:00Z',
    }
    const onApplyDecisions = vi.fn().mockResolvedValue(undefined)

    render(
      <SimilarReviewView
        cards={[card]}
        photosById={photosById}
        activeCardId="card-1"
        onSelectCard={vi.fn()}
        selectedPhotoId={null}
        onSelectPhoto={vi.fn()}
        selectionMode={false}
        selectedIds={new Set()}
        onToggleSelectedId={vi.fn()}
        onClearSelection={vi.fn()}
        onZoomPhotos={vi.fn()}
        embeddingsLoaded={false}
        onApplyDecisions={onApplyDecisions}
      />,
    )

    fireEvent.click(screen.getAllByTitle('Keep')[0])
    fireEvent.click(screen.getAllByTitle('Discard')[1])
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApplyDecisions).toHaveBeenCalledWith({ p1: 'keep', p2: 'discard' })
  })

  it('can apply the recommended keeper as real decisions', async () => {
    const photos = [photo('p1', 'IMG_0001.jpg'), photo('p2', 'IMG_0002.jpg')]
    const photosById = new Map(photos.map((p) => [p.id, p]))
    const card: SimilarReviewCard = {
      id: 'card-1',
      kind: 'burst',
      photoIds: ['p1', 'p2'],
      recommendedKeepPhotoId: 'p2',
      confidence: 0.92,
      title: 'Burst · 2 photos · 1 seconds',
      reason: 'Nearby captures within the active window.',
      fileNameRange: { first: 'IMG_0001.jpg', last: 'IMG_0002.jpg' },
      timeSpanMs: 1_000,
      capturedAt: '2026-01-01T10:00:00Z',
    }
    const onApplyDecisions = vi.fn().mockResolvedValue(undefined)

    render(
      <SimilarReviewView
        cards={[card]}
        photosById={photosById}
        activeCardId="card-1"
        onSelectCard={vi.fn()}
        selectedPhotoId={null}
        onSelectPhoto={vi.fn()}
        selectionMode={false}
        selectedIds={new Set()}
        onToggleSelectedId={vi.fn()}
        onClearSelection={vi.fn()}
        onZoomPhotos={vi.fn()}
        embeddingsLoaded={false}
        onApplyDecisions={onApplyDecisions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use recommendation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onApplyDecisions).toHaveBeenCalledWith({ p1: 'discard', p2: 'keep' })
  })
})
