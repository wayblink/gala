import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PhotoCard } from '../PhotoCard'
import type { TimelinePhoto } from '../../types/photos'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('../../desktop/photos', () => ({
  getThumbnailFile: vi.fn().mockResolvedValue(null),
}))

const photo: TimelinePhoto = {
  id: 'photo-1',
  fileName: 'DSC_1001.jpg',
  relativePath: 'DSC_1001.jpg',
  folderPath: '',
  capturedAt: '2026-05-07T10:00:00.000Z',
  width: 4032,
  height: 3024,
  fileSize: 2_621_440,
  sourceName: 'Camera Roll',
  sourceStatus: 'online',
  thumbnailPath: '/tmp/thumb.jpg',
  isFavorite: false,
  isHidden: false,
  quality: { photoId: 'photo-1', score: 86, label: 'strong', reasons: ['backend sharpness'] },
  tags: [],
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  gpsLatitude: null,
  gpsLongitude: null,
}

describe('PhotoCard', () => {
  it('shows the per-photo quality score outside Similar Review', () => {
    render(<PhotoCard photo={photo} variant="gallery" />)

    expect(screen.getByText('86')).toBeInTheDocument()
    expect(screen.getByText(/Quality 86/)).toBeInTheDocument()
  })
})
