import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PhotoGallery } from '../PhotoGallery'
import type { TimelinePhoto } from '../../types/photos'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('../../desktop/photos', () => ({
  getPhotoDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,preview'),
  getThumbnailFile: vi.fn().mockResolvedValue(null),
}))

const photo = (id: string, fileName: string): TimelinePhoto => ({
  id,
  fileName,
  relativePath: fileName,
  folderPath: '',
  capturedAt: '2026-05-08T00:00:00+00:00',
  width: 1200,
  height: 800,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  gpsLatitude: null,
  gpsLongitude: null,
  fileSize: 1024,
  sourceName: 'source',
  sourceStatus: 'online',
  thumbnailPath: null,
  isFavorite: false, isHidden: false, tags: [],
})

describe('PhotoGallery', () => {
  it('uses the selected photo as the large preview and keeps thumbnails selectable', () => {
    const onSelectPhoto = vi.fn()
    const onOpenPhoto = vi.fn()
    const photos = [photo('first', 'first.jpg'), photo('second', 'second.jpg')]

    render(
      <PhotoGallery
        photos={photos}
        selectedPhotoId="first"
        onSelectPhoto={onSelectPhoto}
        onOpenPhoto={onOpenPhoto}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Open second.jpg' })[0])

    expect(onSelectPhoto).toHaveBeenCalledWith(photos[1])

    const previewButton = document.querySelector('.photo-gallery__stage')
    expect(previewButton).not.toBeNull()
    fireEvent.click(previewButton as Element)

    expect(onOpenPhoto).toHaveBeenCalledWith(photos[0])
  })
})
