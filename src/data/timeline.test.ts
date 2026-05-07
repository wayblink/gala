import { describe, expect, it } from 'vitest'
import { groupPhotosByTimeline } from './timeline'
import type { PhotoItem } from '../types'

const photo = (id: string, capturedAt: string | null): PhotoItem => ({
  id,
  fileName: `${id}.RAF`,
  sourceName: 'X100V Drive',
  sourceStatus: 'online',
  status: 'indexed',
  capturedAt,
  importedAt: '2026-05-07T10:00:00Z',
  camera: 'X100V',
  lens: '23mm f/2',
  dimensions: '6240 x 4160',
  color: '#527c8e',
  aspectRatio: '1 / 1',
  relatedViews: ['Kyoto Nights'],
})

describe('groupPhotosByTimeline', () => {
  it('groups photos by year and month label in descending date order', () => {
    const groups = groupPhotosByTimeline([
      photo('older', '2025-10-04T12:00:00Z'),
      photo('newer', '2026-05-07T12:00:00Z'),
    ])

    expect(groups.map((group) => group.year)).toEqual(['2026', '2025'])
    expect(groups[0].monthLabel).toBe('May')
    expect(groups[0].photos[0].id).toBe('newer')
  })

  it('uses imported date fallback for photos without captured date', () => {
    const groups = groupPhotosByTimeline([photo('fallback', null)])

    expect(groups[0].year).toBe('2026')
    expect(groups[0].dateBasis).toBe('imported')
  })
})
