import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoCard } from '../PhotoCard'
import type { TimelinePhoto } from '../../types/photos'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

const { getThumbnailFile, downloadApplePhotosThumbnail } = vi.hoisted(() => ({
  getThumbnailFile: vi.fn().mockResolvedValue(null),
  downloadApplePhotosThumbnail: vi.fn().mockResolvedValue('/tmp/icloud-thumb.jpg'),
}))

vi.mock('../../desktop/photos', () => ({
  getThumbnailFile,
  downloadApplePhotosThumbnail,
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
  it('loads thumbnail images lazily and decodes them asynchronously', async () => {
    render(<PhotoCard photo={photo} />)

    const image = await screen.findByRole('img', { name: photo.fileName })
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
  })
  it('hides quality by default to avoid unnecessary computation', () => {
    render(<PhotoCard photo={photo} variant="gallery" />)

    expect(screen.queryByText('86')).not.toBeInTheDocument()
    expect(screen.queryByText(/Quality 86/)).not.toBeInTheDocument()
  })

  it('shows the per-photo quality score when explicitly enabled', () => {
    render(<PhotoCard photo={photo} variant="gallery" showQuality />)

    expect(screen.getByText('86')).toBeInTheDocument()
    expect(screen.getByText(/Quality 86/)).toBeInTheDocument()
  })

  it('uses Vite file URLs for web mock thumbnails', async () => {
    render(<PhotoCard photo={photo} />)

    expect(await screen.findByRole('img', { name: photo.fileName })).toHaveAttribute('src', '/@fs/tmp/thumb.jpg')
  })

  it('switches an Apple Photos card to the downloaded original path', async () => {
    const cloudPhoto = { ...photo, id: 'apple-photos:cloud-asset', thumbnailPath: null }
    const { rerender } = render(<PhotoCard photo={cloudPhoto} />)

    expect(await screen.findByText('Download from iCloud')).toBeInTheDocument()
    rerender(<PhotoCard photo={cloudPhoto} originalPath="/originals/cloud-asset.heic" />)

    expect(await screen.findByRole('img', { name: photo.fileName })).toHaveAttribute(
      'src',
      '/@fs/originals/cloud-asset.heic',
    )
    expect(screen.queryByText('Download from iCloud')).not.toBeInTheDocument()
  })

  it('downloads an unavailable Apple Photos thumbnail only after explicit user action', async () => {
    const user = userEvent.setup()
    const cloudPhoto = { ...photo, id: 'apple-photos:cloud-asset', thumbnailPath: null }

    render(<PhotoCard photo={cloudPhoto} />)

    expect(await screen.findByText('Download from iCloud')).toBeInTheDocument()
    expect(downloadApplePhotosThumbnail).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Download DSC_1001.jpg from iCloud' }))

    await waitFor(() => expect(downloadApplePhotosThumbnail).toHaveBeenCalledWith(cloudPhoto.id, 'medium'))
    expect(screen.queryByText('Download from iCloud')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: photo.fileName })).toHaveAttribute('src', '/@fs/tmp/icloud-thumb.jpg')
  })
})
