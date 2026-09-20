import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoViewer } from '../PhotoViewer'
import { getThumbnailFile } from '../../desktop/photos'
import type { TimelinePhoto } from '../../types/photos'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('../../desktop/photos', () => ({
  getPhotoDataUrl: vi.fn(async (photoId: string) => photoId.startsWith('apple-photos:') ? null : `data:image/jpeg;base64,${photoId}`),
  getThumbnailFile: vi.fn(async (photoId: string) => `/thumbs/${photoId}-large.jpg`),
}))

const photos: TimelinePhoto[] = [
  {
    id: 'first',
    fileName: 'first.jpg',
    relativePath: 'first.jpg',
    folderPath: '',
    capturedAt: '2026-05-07T10:00:00.000Z',
    width: 1200,
    height: 800,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    fileSize: 1_245_184,
    sourceName: 'Test Folder',
    sourceStatus: 'online',
    thumbnailPath: null,
    isFavorite: false, isHidden: false, tags: [],
  },
  {
    id: 'second',
    fileName: 'second.jpg',
    relativePath: 'nested/second.jpg',
    folderPath: 'nested',
    capturedAt: null,
    width: 1000,
    height: 1000,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    fileSize: 985_344,
    sourceName: 'Test Folder',
    sourceStatus: 'online',
    thumbnailPath: null,
    isFavorite: false, isHidden: false, tags: [],
  },
]

afterEach(() => {
  vi.clearAllMocks()
  document.body.style.overflow = ''
})

describe('PhotoViewer', () => {
  it('loads the selected original preview', async () => {
    render(<PhotoViewer photos={photos} initialIndex={0} onClose={vi.fn()} />)

    const image = await screen.findByRole('img', { name: 'first.jpg' })

    expect(image).toHaveAttribute('src', 'data:image/jpeg;base64,first')
    expect(getThumbnailFile).toHaveBeenCalledWith('first', 'large')
  })

  it('uses a downloaded Apple Photos original instead of the large thumbnail', async () => {
    const cloudPhoto = { ...photos[0], id: 'apple-photos:cloud-original' }

    render(
      <PhotoViewer
        photos={[cloudPhoto]}
        initialIndex={0}
        onClose={vi.fn()}
        originalPaths={{ [cloudPhoto.id]: '/originals/apple-photo.jpg' }}
      />,
    )

    expect(await screen.findByRole('img', { name: cloudPhoto.fileName })).toHaveAttribute(
      'src',
      '/@fs/originals/apple-photo.jpg',
    )
    expect(screen.queryByRole('button', { name: 'Load original from iCloud' })).not.toBeInTheDocument()
  })

  it('shows Load in fullscreen for an Apple Photos preview', async () => {
    const cloudPhoto = { ...photos[0], id: 'apple-photos:fullscreen' }
    const onLoadOriginal = vi.fn().mockResolvedValue('/originals/fullscreen.heic')
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    render(<PhotoViewer photos={[cloudPhoto]} initialIndex={0} onClose={vi.fn()} onLoadOriginal={onLoadOriginal} />)
    await screen.findByRole('img', { name: cloudPhoto.fileName })
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))

    const load = await screen.findByRole('button', { name: 'Load original' })
    fireEvent.click(load)
    await waitFor(() => expect(onLoadOriginal).toHaveBeenCalledWith(cloudPhoto.id))
    expect(await screen.findByRole('img', { name: cloudPhoto.fileName })).toHaveAttribute('src', '/@fs/originals/fullscreen.heic')
  })

  it('navigates with arrow keys and closes with Escape', async () => {
    const onClose = vi.fn()
    render(<PhotoViewer photos={photos} initialIndex={0} onClose={onClose} />)

    await screen.findByRole('img', { name: 'first.jpg' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    await waitFor(() => {
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    })
    expect(await screen.findByRole('img', { name: 'second.jpg' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
