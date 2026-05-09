import { describe, expect, it } from 'vitest'
import { groupTimelinePhotos } from './photoTimeline'
import type { TimelinePhoto } from '../types/photos'

const photo = (id: string, capturedAt: string | null): TimelinePhoto => ({
  id,
  fileName: `${id}.jpg`,
  relativePath: `${id}.jpg`,
  folderPath: '',
  capturedAt,
  width: null,
  height: null,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  gpsLatitude: null,
  gpsLongitude: null,
  fileSize: 1024,
  sourceName: 'Camera Roll',
  sourceStatus: 'online',
  thumbnailPath: null,
  isFavorite: false, isHidden: false,
})

describe('groupTimelinePhotos', () => {
  it('groups live timeline photos by captured year and month in descending order', () => {
    const groups = groupTimelinePhotos([
      photo('older', '2025-10-04T12:00:00Z'),
      photo('newer', '2026-05-07T12:00:00Z'),
      photo('same-month', '2026-05-01T08:00:00Z'),
    ])

    expect(groups.map((group) => group.key)).toEqual(['2026-05', '2025-10'])
    expect(groups[0].title).toBe('May 2026')
    expect(groups[0].photos.map((item) => item.id)).toEqual(['newer', 'same-month'])
    expect(groups[1].title).toBe('October 2025')
  })

  it('keeps undated photos in a separate final group', () => {
    const groups = groupTimelinePhotos([
      photo('dated', '2026-05-07T12:00:00Z'),
      photo('undated', null),
    ])

    expect(groups.map((group) => group.key)).toEqual(['2026-05', 'undated'])
    expect(groups[1].title).toBe('Undated')
    expect(groups[1].photos[0].id).toBe('undated')
  })
})
