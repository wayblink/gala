import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSourceFolders, getTimelinePhotos, searchPhotos } from './photos'

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
