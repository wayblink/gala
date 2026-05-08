import { afterEach, describe, expect, it, vi } from 'vitest'
import { listenToScanProgress, getLibrarySummary, pickPhotoFolder, scanPhotoSource } from './library'
import { listen } from '@tauri-apps/api/event'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  delete window.__TAURI_INTERNALS__
})

describe('library desktop bridge', () => {
  it('returns an empty library summary in web mode', async () => {
    await expect(getLibrarySummary()).resolves.toEqual({
      sources: [],
      totalPhotos: 0,
      recentlyAddedCount: 0,
      favoritesCount: 0,
    })
  })

  it('invokes the native folder picker when Tauri is available', async () => {
    const invoke = vi.fn().mockResolvedValue('/Users/me/Pictures')
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(pickPhotoFolder()).resolves.toBe('/Users/me/Pictures')
    expect(invoke).toHaveBeenCalledWith('pick_photo_folder', {}, undefined)
  })

  it('passes the root path into the native scan command', async () => {
    const summary = {
      source: {
        id: 'source-1',
        name: 'Pictures',
        rootPath: '/Users/me/Pictures',
        status: 'online',
        photoCount: 2,
      },
      indexedCount: 2,
      skippedCount: 0,
    }
    const invoke = vi.fn().mockResolvedValue(summary)
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(scanPhotoSource('/Users/me/Pictures')).resolves.toEqual(summary)
    expect(invoke).toHaveBeenCalledWith('scan_photo_source', {
      rootPath: '/Users/me/Pictures',
    }, undefined)
  })

  it('subscribes to native scan progress events', async () => {
    const unlisten = vi.fn()
    vi.mocked(listen).mockResolvedValue(unlisten)
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() }
    const onProgress = vi.fn()

    await expect(listenToScanProgress(onProgress)).resolves.toBe(unlisten)

    expect(listen).toHaveBeenCalledWith('gala://scan-progress', expect.any(Function))
  })
})
