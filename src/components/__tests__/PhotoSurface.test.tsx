import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoSurface } from '../PhotoSurface'
import type { TimelinePhoto } from '../../types/photos'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

const {
  downloadApplePhotosOriginal,
  getAlbumPhotos,
  getFavoritePhotos,
  getFilteredPhotos,
  getHiddenPhotos,
  getPhotosByLabel,
  getPhotosByPerson,
  getPhotosByTag,
  getRecentlyAddedPhotos,
  getSourceCollectionPhotos,
  getThumbnailFile,
  getTimelinePhotos,
  searchPhotos,
} = vi.hoisted(() => ({
  downloadApplePhotosOriginal: vi.fn().mockResolvedValue(null),
  getAlbumPhotos: vi.fn().mockResolvedValue([]),
  getFavoritePhotos: vi.fn().mockResolvedValue([]),
  getFilteredPhotos: vi.fn().mockResolvedValue([]),
  getHiddenPhotos: vi.fn().mockResolvedValue([]),
  getPhotosByLabel: vi.fn().mockResolvedValue([]),
  getPhotosByPerson: vi.fn().mockResolvedValue([]),
  getPhotosByTag: vi.fn().mockResolvedValue([]),
  getRecentlyAddedPhotos: vi.fn().mockResolvedValue([]),
  getSourceCollectionPhotos: vi.fn().mockResolvedValue([]),
  getThumbnailFile: vi.fn().mockResolvedValue(null),
  getTimelinePhotos: vi.fn().mockResolvedValue([]),
  searchPhotos: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../desktop/photos', () => ({
  downloadApplePhotosOriginal,
  getAlbumPhotos,
  getFavoritePhotos,
  getFilteredPhotos,
  getHiddenPhotos,
  getPhotosByLabel,
  getPhotosByPerson,
  getPhotosByTag,
  getRecentlyAddedPhotos,
  getSourceCollectionPhotos,
  getThumbnailFile,
  getTimelinePhotos,
  searchPhotos,
}))

const makePhoto = (index: number, capturedAt = '2026-05-07T10:00:00.000Z'): TimelinePhoto => ({
  id: `photo-${String(index).padStart(3, '0')}`,
  fileName: `IMG_${String(index).padStart(4, '0')}.jpg`,
  relativePath: `IMG_${String(index).padStart(4, '0')}.jpg`,
  folderPath: '',
  capturedAt,
  width: 1200,
  height: 800,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  gpsLatitude: null,
  gpsLongitude: null,
  fileSize: 120_000,
  sourceName: 'Test Source',
  sourceStatus: 'online',
  thumbnailPath: null,
  isFavorite: false,
  isHidden: false,
  tags: [],
})

const renderSurface = (props: Partial<Parameters<typeof PhotoSurface>[0]> = {}) => {
  const defaults: Parameters<typeof PhotoSurface>[0] = {
    filter: { type: 'all' },
    title: 'All Photos',
    displayMode: 'thumbnail',
    selectedPhotoId: null,
    searchQuery: '',
    onSelectPhoto: vi.fn(),
    selectionMode: true,
    selectedIds: new Set(),
    onToggleSelectionMode: vi.fn(),
    onToggleSelectedId: vi.fn(),
    onClearSelection: vi.fn(),
    onSetSelectedIds: vi.fn(),
  }

  return render(<PhotoSurface {...defaults} {...props} />)
}

describe('PhotoSurface selection actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getThumbnailFile.mockResolvedValue(null)
    getTimelinePhotos.mockResolvedValue([])
    downloadApplePhotosOriginal.mockResolvedValue(null)
  })

  it('selects every matching photo across pages instead of only rendered photos', async () => {
    const user = userEvent.setup()
    const allPhotos = Array.from({ length: 502 }, (_, index) => makePhoto(index + 1))
    getTimelinePhotos.mockImplementation(async (limit: number, offset: number) => allPhotos.slice(offset, offset + limit))
    const onSetSelectedIds = vi.fn()

    renderSurface({ onSetSelectedIds })

    await screen.findByRole('button', { name: 'Open IMG_0001.jpg' })
    await user.click(screen.getByRole('button', { name: 'Select all matching' }))

    await waitFor(() => expect(onSetSelectedIds).toHaveBeenCalled())
    const [ids, scope] = onSetSelectedIds.mock.lastCall as [Set<string>, unknown]
    expect(ids.size).toBe(502)
    expect(ids.has('photo-001')).toBe(true)
    expect(ids.has('photo-502')).toBe(true)
    expect(scope).toEqual({ kind: 'matching', label: 'All Photos' })
    expect(getTimelinePhotos).toHaveBeenCalledWith(500, 0, { type: 'all' })
    expect(getTimelinePhotos).toHaveBeenCalledWith(500, 500, { type: 'all' })
  })

  it('allows selecting exactly the 100,000 photo safety limit', async () => {
    const user = userEvent.setup()
    getTimelinePhotos.mockImplementation(async (limit: number, offset: number) => {
      if (limit === 1 && offset === 100_000) return []
      const remaining = Math.max(0, 100_000 - offset)
      return Array.from({ length: Math.min(limit, remaining) }, (_, index) => makePhoto(offset + index + 1))
    })
    const onSetSelectedIds = vi.fn()

    renderSurface({ onSetSelectedIds })

    await screen.findByRole('button', { name: 'Open IMG_0001.jpg' })
    await user.click(screen.getByRole('button', { name: 'Select all matching' }))

    await waitFor(() => expect(onSetSelectedIds).toHaveBeenCalled(), { timeout: 5000 })
    const [ids] = onSetSelectedIds.mock.lastCall as [Set<string>, unknown]
    expect(ids.size).toBe(100_000)
    expect(ids.has('photo-100000')).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getTimelinePhotos).toHaveBeenCalledWith(1, 100_000, { type: 'all' })
  })

  it('selects all photos in a date group across the current matching result', async () => {
    const user = userEvent.setup()
    const sameDatePhotos = Array.from({ length: 55 }, (_, index) => makePhoto(index + 1, '2026-05-07T10:00:00.000Z'))
    const otherDatePhotos = Array.from({ length: 5 }, (_, index) => makePhoto(index + 56, '2026-05-06T10:00:00.000Z'))
    const allPhotos = [...sameDatePhotos, ...otherDatePhotos]
    getTimelinePhotos.mockImplementation(async (limit: number, offset: number) => allPhotos.slice(offset, offset + limit))
    const onSetSelectedIds = vi.fn()

    renderSurface({ onSetSelectedIds })

    await screen.findByText('May 7, 2026')
    await user.click(screen.getByRole('button', { name: 'Select photos from May 7, 2026' }))

    await waitFor(() => expect(onSetSelectedIds).toHaveBeenCalled())
    const [ids, scope] = onSetSelectedIds.mock.lastCall as [Set<string>, unknown]
    expect(ids.size).toBe(55)
    expect(ids.has('photo-001')).toBe(true)
    expect(ids.has('photo-055')).toBe(true)
    expect(ids.has('photo-056')).toBe(false)
    expect(scope).toEqual({ kind: 'date', dateKey: '2026-05-07', label: 'May 7, 2026' })
  })

  it('reports hovered photos and keeps the selection bar selection-only', async () => {
    const user = userEvent.setup()
    const onHoverPhoto = vi.fn()
    getTimelinePhotos.mockResolvedValue([makePhoto(1)])

    renderSurface({
      onHoverPhoto,
      selectedIds: new Set(['apple-photos:a', 'local:c']),
    })

    await user.hover(await screen.findByRole('button', { name: 'Open IMG_0001.jpg' }))
    expect(onHoverPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'photo-001' }))
    expect(screen.getByRole('button', { name: 'Select all matching' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select visible' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unselect all' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Favorite/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to Album/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tag/ })).not.toBeInTheDocument()
  })

  it('switches the timeline query between merged and separate variants', async () => {
    const user = userEvent.setup()
    getTimelinePhotos.mockResolvedValue([makePhoto(1)])

    renderSurface()
    await screen.findByRole('button', { name: 'Open IMG_0001.jpg' })
    await user.click(screen.getByRole('button', { name: 'Variant display' }))
    await user.click(screen.getByRole('option', { name: /分开显示/ }))

    await waitFor(() => expect(getTimelinePhotos).toHaveBeenCalledWith(50, 0, { type: 'all' }, false))
  })

  it('selects only RAW physical variants when that selection range is active', async () => {
    const user = userEvent.setup()
    const merged = {
      ...makePhoto(1),
      variantCount: 3,
      variants: [
        { id: 'raw-1', fileName: 'IMG_0001.ARW', extension: 'arw', formatKind: 'raw' },
        { id: 'jpeg-1', fileName: 'IMG_0001.JPG', extension: 'jpg', formatKind: 'jpeg' },
        { id: 'heif-1', fileName: 'IMG_0001.HIF', extension: 'hif', formatKind: 'heif' },
      ],
    }
    getTimelinePhotos.mockImplementation(async (_limit: number, offset: number) => offset === 0 ? [merged] : [])
    const onSetSelectedIds = vi.fn()
    renderSurface({ onSetSelectedIds })

    await screen.findByRole('button', { name: 'Open IMG_0001.jpg' })
    await user.click(screen.getByRole('button', { name: 'Variant selection' }))
    await user.click(screen.getByRole('option', { name: /仅选择 RAW/ }))
    await user.click(screen.getByRole('button', { name: 'Select all matching' }))

    await waitFor(() => expect(onSetSelectedIds).toHaveBeenCalled())
    const [ids] = onSetSelectedIds.mock.lastCall as [Set<string>]
    expect([...ids]).toEqual(['raw-1'])
  })
})
