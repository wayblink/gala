import { describe, expect, it } from 'vitest'
import {
  buildSimilarReviewQueue,
  recommendKeepPhotoId,
} from '../similarReviewModel'

const at = (iso: string | null, id: string, name = `${id}.JPG`) => ({
  id,
  fileName: name,
  capturedAt: iso,
  sourceName: 'A',
})

describe('buildSimilarReviewQueue', () => {
  it('groups nearby captures into a burst card under the default window', () => {
    const queue = buildSimilarReviewQueue([
      at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
      at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
      at('2026-05-12T12:00:00.000Z', 'p3', 'IMG_0099.JPG'),
    ])
    expect(queue.length).toBe(2)
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
    expect(queue[0].kind).toBe('burst')
  })

  it('respects a custom windowMs and groups within the wider window', () => {
    const queue = buildSimilarReviewQueue(
      [
        at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        at('2026-05-12T10:00:45.000Z', 'p2', 'IMG_0002.JPG'),
      ],
      { windowMs: 60_000 },
    )
    expect(queue.length).toBe(1)
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
  })

  it('splits when photos exceed the configured window', () => {
    const queue = buildSimilarReviewQueue(
      [
        at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        at('2026-05-12T10:00:10.000Z', 'p2', 'IMG_0002.JPG'),
      ],
      { windowMs: 5_000 },
    )
    expect(queue.length).toBe(2)
    expect(queue.map((c) => c.kind)).toEqual(['same-scene', 'same-scene'])
  })

  it('falls back to filename adjacency when both photos lack EXIF time', () => {
    const queue = buildSimilarReviewQueue([
      at(null, 'p1', 'IMG_0001.JPG'),
      at(null, 'p2', 'IMG_0002.JPG'),
      at(null, 'p3', 'IMG_0003.JPG'),
    ])
    expect(queue.length).toBe(1)
    expect(queue[0].photoIds).toEqual(['p1', 'p2', 'p3'])
    expect(queue[0].kind).toBe('burst')
  })

  it('does not group via filename when sequence numbers are far apart', () => {
    const queue = buildSimilarReviewQueue([
      at(null, 'p1', 'IMG_0001.JPG'),
      at(null, 'p2', 'IMG_0010.JPG'),
    ])
    expect(queue.length).toBe(2)
  })

  it('does not group via filename when prefixes differ', () => {
    const queue = buildSimilarReviewQueue([
      at(null, 'p1', 'IMG_0001.JPG'),
      at(null, 'p2', 'CAM_0002.JPG'),
    ])
    expect(queue.length).toBe(2)
  })

  it('does not bridge EXIF-known and EXIF-missing photos via filename', () => {
    const queue = buildSimilarReviewQueue([
      at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
      at(null, 'p2', 'IMG_0002.JPG'),
    ])
    expect(queue.length).toBe(2)
  })

  it('sorts photos inside a group naturally by filename when timestamps tie', () => {
    const sameTime = '2026-05-12T10:00:00.000Z'
    const queue = buildSimilarReviewQueue([
      at(sameTime, 'p2', 'IMG_0010.JPG'),
      at(sameTime, 'p1', 'IMG_0002.JPG'),
    ])
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
  })

  it('exposes filename range and time span on each card', () => {
    const queue = buildSimilarReviewQueue([
      at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
      at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
      at('2026-05-12T10:00:05.000Z', 'p3', 'IMG_0003.JPG'),
    ])
    expect(queue[0].fileNameRange).toEqual({ first: 'IMG_0001.JPG', last: 'IMG_0003.JPG' })
    expect(queue[0].timeSpanMs).toBe(5_000)
    expect(queue[0].capturedAt).toBe('2026-05-12T10:00:00.000Z')
  })

  // Embedding-aware grouping (M2.2). The "scene" axis is a Float32Array of
  // unit-magnitude vectors so cosine distance has a clean closed form.
  const v = (...xs: number[]) => new Float32Array(xs)

  it('keeps photos in same group when embeddings are close', () => {
    const queue = buildSimilarReviewQueue(
      [
        at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
      ],
      {
        embeddings: new Map([
          ['p1', v(1, 0, 0)],
          ['p2', v(0.99, 0.01, 0)],
        ]),
      },
    )
    expect(queue.length).toBe(1)
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
    expect(queue[0].reason).toMatch(/scene|similar/)
  })

  it('splits photos in same time window when scenes differ', () => {
    // Cosine distance between v(1,0,0) and v(0,1,0) is 1.0 — well above
    // the default 0.30 threshold.
    const queue = buildSimilarReviewQueue(
      [
        at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
      ],
      {
        embeddings: new Map([
          ['p1', v(1, 0, 0)],
          ['p2', v(0, 1, 0)],
        ]),
      },
    )
    // visually different photos should split into two single cards
    expect(queue.length).toBe(2)
  })

  it('falls back to time-only when embedding is missing on either photo', () => {
    const queue = buildSimilarReviewQueue(
      [
        at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
      ],
      {
        embeddings: new Map([['p1', v(1, 0, 0)]]),
      },
    )
    expect(queue.length).toBe(1)
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
  })

  it('honors a custom thresholdCosine', () => {
    // Cosine distance between v(1,0,0) and v(0.7, 0.71, 0): sim ≈ 0.7/1.0 = 0.7,
    // distance ≈ 0.3. Threshold 0.1 should split, 0.5 should merge.
    const photos = [
      at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
      at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
    ]
    const embeddings = new Map([
      ['p1', v(1, 0, 0)],
      ['p2', v(0.7, 0.71, 0)],
    ])
    const tight = buildSimilarReviewQueue(photos, { embeddings, thresholdCosine: 0.1 })
    expect(tight.length).toBe(2)
    const loose = buildSimilarReviewQueue(photos, { embeddings, thresholdCosine: 0.5 })
    expect(loose.length).toBe(1)
  })

  it('recommends the strongest visual quality candidate in a group', () => {
    const group = [
      {
        ...at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        width: 1200,
        height: 800,
        fileSize: 300_000,
      },
      {
        ...at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
        width: 6000,
        height: 4000,
        fileSize: 8_000_000,
      },
    ]

    expect(recommendKeepPhotoId(group)).toBe('p2')
    const queue = buildSimilarReviewQueue(group)
    expect(queue[0].recommendedKeepPhotoId).toBe('p2')
  })

  it('uses persisted photo quality when choosing a recommended keeper', () => {
    const group = [
      {
        ...at('2026-05-12T10:00:00.000Z', 'p1', 'IMG_0001.JPG'),
        quality: { photoId: 'p1', score: 92, label: 'strong' as const, reasons: ['backend sharpness'] },
      },
      {
        ...at('2026-05-12T10:00:03.000Z', 'p2', 'IMG_0002.JPG'),
        width: 6000,
        height: 4000,
        fileSize: 8_000_000,
      },
    ]

    expect(recommendKeepPhotoId(group)).toBe('p1')
  })
})
