import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setPhotosFavoriteBatch, setPhotosHiddenBatch } from '../../desktop/photos'
import { useSimilarReviewWorkflow } from './useSimilarReviewWorkflow'

vi.mock('../../desktop/photos', () => ({
  getTimelinePhotos: vi.fn().mockResolvedValue([]),
  setPhotosFavoriteBatch: vi.fn().mockResolvedValue(undefined),
  setPhotosHiddenBatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../desktop/capability', () => ({
  analysisEmbedPhotos: vi.fn(),
  photoEmbeddingsByIds: vi.fn().mockResolvedValue([]),
  photoEmbeddingsSummary: vi.fn().mockResolvedValue({ total: 0, embedded: 0 }),
  readArtifactBytes: vi.fn(),
}))

describe('useSimilarReviewWorkflow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('persists keep decisions as favorite and discard decisions as hidden', async () => {
    const onDecisionsApplied = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useSimilarReviewWorkflow({
        selected: true,
        runBackgroundTask: vi.fn(),
        onDecisionsApplied,
      }),
    )

    await act(async () => {
      await result.current.applyDecisions({ p1: 'keep', p2: 'discard' })
    })

    expect(setPhotosHiddenBatch).toHaveBeenCalledWith(['p1'], false)
    expect(setPhotosFavoriteBatch).toHaveBeenCalledWith(['p1'], true)
    expect(setPhotosFavoriteBatch).toHaveBeenCalledWith(['p2'], false)
    expect(setPhotosHiddenBatch).toHaveBeenCalledWith(['p2'], true)
    expect(onDecisionsApplied).toHaveBeenCalledWith({ p1: 'keep', p2: 'discard' })
    expect(result.current.decisionsBusy).toBe(false)
  })
})
