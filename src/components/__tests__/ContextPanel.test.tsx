import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContextPanel } from '../ContextPanel'
import type { LibrarySource, LibrarySummary } from '../../types/library'
import type { TimelinePhoto } from '../../types/photos'

const librarySummary: LibrarySummary = {
  sources: [],
  totalPhotos: 1,
  recentlyAddedCount: 1,
  favoritesCount: 0, hiddenCount: 0,
}

const selectedPhoto: TimelinePhoto = {
  id: 'photo-1',
  fileName: 'DSC_1001.jpg',
  relativePath: 'Trips/Japan/DSC_1001.jpg',
  folderPath: 'Trips/Japan',
  capturedAt: '2026-05-07T10:00:00.000Z',
  width: 4032,
  height: 3024,
  fileSize: 2_621_440,
  sourceName: 'Camera Roll',
  sourceStatus: 'online',
  thumbnailPath: null,
  isFavorite: false, isHidden: false, tags: [],
  quality: { photoId: 'photo-1', score: 88, label: 'strong', reasons: ['backend sharpness'] },
  cameraMake: 'Fujifilm',
  cameraModel: 'X-T5',
  lensModel: 'XF 23mm F1.4 R LM WR',
  gpsLatitude: 35.0116,
  gpsLongitude: 135.7681,
}

const activeSource: LibrarySource = {
  id: 'source-1',
  name: 'test-photos-faces',
  rootPath: '/Users/me/Pictures/test-photos-faces',
  status: 'online',
  photoCount: 10,
}

describe('ContextPanel', () => {
  it('shows selected photo metadata for the MVP detail panel', () => {
    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        showQuality
      />,
    )

    expect(screen.getByText('DSC_1001.jpg')).toBeInTheDocument()
    expect(screen.getByText('4032 × 3024')).toBeInTheDocument()
    expect(screen.getByText('2.5 MB')).toBeInTheDocument()
    expect(screen.getByText('Trips/Japan')).toBeInTheDocument()
    expect(screen.getByText('Fujifilm X-T5')).toBeInTheDocument()
    expect(screen.getByText('XF 23mm F1.4 R LM WR')).toBeInTheDocument()
    expect(screen.getByText('35.01160, 135.76810')).toBeInTheDocument()
    expect(screen.getByText('Photo Quality')).toBeInTheDocument()
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('backend sharpness')).toBeInTheDocument()
  })

  it('hides Photo Quality by default', () => {
    render(<ContextPanel librarySummary={librarySummary} selectedPhoto={selectedPhoto} />)
    expect(screen.queryByText('Photo Quality')).not.toBeInTheDocument()
  })

  it('loads an Apple Photos original from Selected Photo actions', async () => {
    const user = userEvent.setup()
    const onLoadApplePhotosOriginal = vi.fn().mockResolvedValue('/originals/apple-photo.heic')

    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={{ ...selectedPhoto, id: 'apple-photos:asset-1' }}
        onLoadApplePhotosOriginal={onLoadApplePhotosOriginal}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Load' }))
    expect(onLoadApplePhotosOriginal).toHaveBeenCalledWith('apple-photos:asset-1')
    expect(await screen.findByText('Original loaded')).toBeInTheDocument()
  })

  it('opens an album dialog when no albums exist and creates from the dialog', async () => {
    const user = userEvent.setup()
    const onCreateAlbum = vi.fn().mockResolvedValue({ id: 'album-1', name: 'Review Picks', photoCount: 0, createdAt: '2026-05-07T00:00:00.000Z' })
    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        albums={[]}
        onCreateAlbum={onCreateAlbum}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+ Add to Album' }))
    expect(screen.getByRole('dialog', { name: 'Add to Album' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search albums' })).toBeInTheDocument()
    expect(screen.getByText('Create an album first')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'New album name' }), 'Review Picks')
    await user.click(screen.getByRole('button', { name: 'Create album' }))
    expect(onCreateAlbum).toHaveBeenCalledWith('Review Picks')
    expect(screen.getByRole('searchbox', { name: 'Search albums' })).toHaveValue('Review Picks')
  })

  it('searches albums in the dialog and adds the selected album', async () => {
    const user = userEvent.setup()
    const onAddToAlbum = vi.fn()
    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        albums={[
          { id: 'album-1', name: 'Trips', photoCount: 2, createdAt: '2026-05-07T00:00:00.000Z' },
          { id: 'album-2', name: 'Family', photoCount: 5, createdAt: '2026-05-08T00:00:00.000Z' },
        ]}
        onAddToAlbum={onAddToAlbum}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+ Add to Album' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search albums' }), 'Fam')

    expect(screen.queryByRole('button', { name: 'Add to Trips' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to Family' }))
    expect(onAddToAlbum).toHaveBeenCalledWith('album-2', 'photo-1')
    expect(screen.queryByRole('dialog', { name: 'Add to Album' })).not.toBeInTheDocument()
  })

  it('removes the current photo from the active album through the album dialog', async () => {
    const user = userEvent.setup()
    const onRemoveFromAlbum = vi.fn()
    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        currentAlbumId="album-1"
        albums={[{ id: 'album-1', name: 'Trips', photoCount: 2, createdAt: '2026-05-07T00:00:00.000Z' }]}
        onRemoveFromAlbum={onRemoveFromAlbum}
      />,
    )

    await user.click(screen.getByRole('button', { name: '- Remove from Album' }))
    expect(screen.getByRole('dialog', { name: 'Remove from Album' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'New album name' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove from Trips' }))

    expect(onRemoveFromAlbum).toHaveBeenCalledWith('album-1', 'photo-1')
    expect(screen.queryByRole('dialog', { name: 'Remove from Album' })).not.toBeInTheDocument()
  })

  it('removes a batch selection from the active album through the album dialog', async () => {
    const user = userEvent.setup()
    const onBatchRemoveFromAlbum = vi.fn()
    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        currentAlbumId="album-1"
        selectedIds={new Set(['photo-1', 'photo-2'])}
        albums={[{ id: 'album-1', name: 'Trips', photoCount: 2, createdAt: '2026-05-07T00:00:00.000Z' }]}
        onBatchRemoveFromAlbum={onBatchRemoveFromAlbum}
      />,
    )

    await user.click(screen.getByRole('button', { name: '- Remove all from Album' }))
    await user.click(screen.getByRole('button', { name: 'Remove from Trips' }))

    expect(onBatchRemoveFromAlbum).toHaveBeenCalledWith('album-1', ['photo-1', 'photo-2'])
  })

  it('shows batch selection actions above the current photo inspector when a selection exists', async () => {
    const user = userEvent.setup()
    const onLoadApplePhotosOriginals = vi.fn().mockResolvedValue({ downloaded: 1, failed: 0, paths: [] })
    const onBatchFavorite = vi.fn()
    const onBatchHide = vi.fn()
    const onBatchAddTags = vi.fn()
    const onBatchAddToAlbum = vi.fn()
    const onBatchRemoveFromAlbum = vi.fn()

    render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        selectedIds={new Set(['apple-photos:a', 'local:b'])}
        selectionScope={{ kind: 'matching', label: 'All Photos' }}
        albums={[{ id: 'album-1', name: 'Trips', photoCount: 2, createdAt: '2026-05-07T00:00:00.000Z' }]}
        onLoadApplePhotosOriginals={onLoadApplePhotosOriginals}
        onBatchFavorite={onBatchFavorite}
        onBatchHide={onBatchHide}
        onBatchAddTags={onBatchAddTags}
        onBatchAddToAlbum={onBatchAddToAlbum}
        onBatchRemoveFromAlbum={onBatchRemoveFromAlbum}
      />,
    )

    expect(screen.getByText('Batch Selection')).toBeInTheDocument()
    expect(screen.getByText('2 photos selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Favorite all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add all to Album' })).toBeInTheDocument()
    expect(screen.getByText('Current Photo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load' }))
    expect(onLoadApplePhotosOriginals).toHaveBeenCalledWith(['apple-photos:a'])
    expect(screen.getByText('DSC_1001.jpg')).toBeInTheDocument()
  })

  it('shows current source metadata above selected photo details and supports inline rename', async () => {
    const user = userEvent.setup()
    const onStartEditingSource = vi.fn()
    const onRenameSource = vi.fn()

    const { rerender } = render(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        activeSource={activeSource}
        onStartEditingSource={onStartEditingSource}
        onRenameSource={onRenameSource}
      />,
    )

    expect(screen.getByText('Current Source')).toBeInTheDocument()
    expect(screen.getByText('test-photos-faces')).toBeInTheDocument()
    expect(screen.getByText('/Users/me/Pictures/test-photos-faces')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onStartEditingSource).toHaveBeenCalledWith('source-1')

    rerender(
      <ContextPanel
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
        activeSource={activeSource}
        editingSourceId="source-1"
        onStartEditingSource={onStartEditingSource}
        onRenameSource={onRenameSource}
      />,
    )

    const input = screen.getByLabelText('Source name')
    await user.clear(input)
    await user.type(input, 'Faces Library')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onRenameSource).toHaveBeenCalledWith('source-1', 'Faces Library')
  })
})
