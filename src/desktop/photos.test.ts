import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteSource, downloadApplePhotosOriginal, downloadApplePhotosOriginals, downloadApplePhotosThumbnail, getSourceFolders, getTimelinePhotos, renameSource, searchPhotos, createAlbum, getAlbums, addPhotoToAlbum, addPhotosToAlbumBatch, getAlbumPhotos, removePhotoFromAlbum, removePhotosFromAlbumBatch } from './photos'
import { getLibrarySummary } from './library'

afterEach(() => {
  vi.restoreAllMocks()
  delete window.__TAURI_INTERNALS__
})

describe('desktop photos bridge', () => {
  it('passes source folder filters to the native timeline command', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    window.__TAURI_INTERNALS__ = { invoke }

    await getTimelinePhotos(40, 80, {
      type: 'folder',
      sourceId: 'source-1',
      folderPath: 'Trips/Japan',
    })

    expect(invoke).toHaveBeenCalledWith(
      'get_timeline_photos_cmd',
      {
        limit: 40,
        offset: 80,
        sourceId: 'source-1',
        folderPath: 'Trips/Japan',
      },
      undefined,
    )
  })

  it('loads nested source folders from the native command', async () => {
    const folders = [
      {
        id: 'source-1:Trips/Japan',
        sourceId: 'source-1',
        name: 'Japan',
        folderPath: 'Trips/Japan',
        depth: 2,
        photoCount: 12,
      },
    ]
    const invoke = vi.fn().mockResolvedValue(folders)
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(getSourceFolders()).resolves.toEqual(folders)
    expect(invoke).toHaveBeenCalledWith('get_source_folders_cmd', {}, undefined)
  })

  it('mutates source names and deletion in web preview mode', async () => {
    const source = (await getLibrarySummary()).sources[0]

    await renameSource(source.id, 'Travel Archive')
    expect((await getLibrarySummary()).sources.find((item) => item.id === source.id)?.name).toBe('Travel Archive')

    await deleteSource(source.id)
    expect((await getLibrarySummary()).sources.find((item) => item.id === source.id)).toBeUndefined()
    expect((await getSourceFolders()).some((folder) => folder.sourceId === source.id)).toBe(false)
  })

  it('mutates albums in web preview mode', async () => {
    const album = await createAlbum('Review Picks')
    expect(album).not.toBeNull()
    expect(await getAlbums()).toEqual([expect.objectContaining({ id: album!.id, name: 'Review Picks', photoCount: 0 })])

    await addPhotoToAlbum(album!.id, 'source-001')
    expect(await getAlbums()).toEqual([expect.objectContaining({ id: album!.id, photoCount: 1 })])
    await expect(getAlbumPhotos(album!.id, 10, 0)).resolves.toEqual([
      expect.objectContaining({ id: 'source-001', fileName: 'IMG_0001.jpg' }),
    ])

    await addPhotosToAlbumBatch(album!.id, ['face-001', 'face-002'])
    expect((await getAlbums())[0].photoCount).toBe(3)
    await removePhotoFromAlbum(album!.id, 'face-001')
    await removePhotosFromAlbumBatch(album!.id, ['source-001', 'face-002'])
    expect((await getAlbums())[0].photoCount).toBe(0)
    await expect(getAlbumPhotos(album!.id, 10, 0)).resolves.toEqual([])
  })

  it('passes source mutations to native commands', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    window.__TAURI_INTERNALS__ = { invoke }

    await deleteSource('source-1')
    await renameSource('source-1', 'Travel Archive')

    expect(invoke).toHaveBeenNthCalledWith(1, 'delete_source_cmd', { sourceId: 'source-1' }, undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'rename_source_cmd', {
      sourceId: 'source-1',
      newName: 'Travel Archive',
    }, undefined)
  })

  it('requests an iCloud thumbnail only through the explicit Apple Photos command', async () => {
    const invoke = vi.fn().mockResolvedValue('/tmp/cloud-thumb.jpg')
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(downloadApplePhotosThumbnail('apple-photos:asset-1', 'medium')).resolves.toBe('/tmp/cloud-thumb.jpg')
    expect(invoke).toHaveBeenCalledWith(
      'download_apple_photos_thumbnail_cmd',
      { photoId: 'apple-photos:asset-1', size: 'medium' },
      undefined,
    )
  })

  it('requests date-batch Apple Photos originals through the batch command', async () => {
    const invoke = vi.fn().mockResolvedValue({ downloaded: 2, failed: 0, paths: [
      { photoId: 'apple-photos:a', path: '/tmp/a.heic' },
      { photoId: 'apple-photos:b', path: '/tmp/b.heic' },
    ] })
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(downloadApplePhotosOriginals(['apple-photos:a', 'apple-photos:b'])).resolves.toEqual({ downloaded: 2, failed: 0, paths: [
      { photoId: 'apple-photos:a', path: '/tmp/a.heic' },
      { photoId: 'apple-photos:b', path: '/tmp/b.heic' },
    ] })
    expect(invoke).toHaveBeenCalledWith(
      'download_apple_photos_originals_cmd',
      { photoIds: ['apple-photos:a', 'apple-photos:b'] },
      undefined,
    )
  })

  it('requests an Apple Photos original only through the explicit command', async () => {
    const invoke = vi.fn().mockResolvedValue('/tmp/original.heic')
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(downloadApplePhotosOriginal('apple-photos:asset-1')).resolves.toBe('/tmp/original.heic')
    expect(invoke).toHaveBeenCalledWith(
      'download_apple_photos_original_cmd',
      { photoId: 'apple-photos:asset-1' },
      undefined,
    )
  })

  it('passes search queries to the native search command', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    window.__TAURI_INTERNALS__ = { invoke }

    await searchPhotos('Kyoto', 30, 60)

    expect(invoke).toHaveBeenCalledWith(
      'search_photos_cmd',
      {
        query: 'Kyoto',
        limit: 30,
        offset: 60,
      },
      undefined,
    )
  })
})
