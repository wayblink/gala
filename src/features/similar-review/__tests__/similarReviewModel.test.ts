import { describe, expect, it } from 'vitest'
import { buildSimilarReviewQueue } from '../similarReviewModel'

const photos = [
  { id: 'p1', fileName: 'IMG_1001.JPG', capturedAt: '2026-05-12T10:00:00.000Z', sourceName: 'A' },
  { id: 'p2', fileName: 'IMG_1002.JPG', capturedAt: '2026-05-12T10:00:03.000Z', sourceName: 'A' },
  { id: 'p3', fileName: 'IMG_2001.JPG', capturedAt: '2026-05-12T12:00:00.000Z', sourceName: 'A' },
]

describe('buildSimilarReviewQueue', () => {
  it('groups nearby captures into a review card', () => {
    const queue = buildSimilarReviewQueue(photos)
    expect(queue.length).toBe(2)
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
    expect(queue[0].kind).toBe('burst')
  })
})
