import { describe, expect, it } from 'vitest'
import { computePhotoQualityScore, recommendHighestQualityPhotoId } from '../photoQuality'

const photo = (id: string, overrides: Partial<Parameters<typeof computePhotoQualityScore>[0]> = {}) => ({
  id,
  fileName: `${id}.jpg`,
  width: 4000,
  height: 3000,
  fileSize: 5_000_000,
  isFavorite: false,
  isHidden: false,
  ...overrides,
})

describe('photoQuality', () => {
  it('scores every photo from available metadata', () => {
    const quality = computePhotoQualityScore(photo('p1'))

    expect(quality.photoId).toBe('p1')
    expect(quality.score).toBeGreaterThan(70)
    expect(quality.reasons).toContain('high resolution')
    expect(quality.reasons).toContain('photo format')
  })

  it('uses an existing persisted quality score when present', () => {
    const quality = computePhotoQualityScore(photo('p1', {
      quality: {
        photoId: 'stale-id',
        score: 87,
        label: 'strong',
        reasons: ['backend sharpness'],
      },
    }))

    expect(quality).toEqual({
      photoId: 'p1',
      score: 87,
      label: 'strong',
      reasons: ['backend sharpness'],
    })
  })

  it('penalizes hidden photos in the quality score', () => {
    const visible = computePhotoQualityScore(photo('visible'))
    const hidden = computePhotoQualityScore(photo('hidden', { isHidden: true }))

    expect(hidden.score).toBeLessThan(visible.score)
    expect(hidden.reasons).toContain('already hidden')
  })

  it('recommends the strongest quality candidate', () => {
    const low = photo('low', { width: 1200, height: 800, fileSize: 300_000 })
    const high = photo('high', { width: 6000, height: 4000, fileSize: 8_000_000 })

    expect(recommendHighestQualityPhotoId([low, high])).toBe('high')
  })
})
