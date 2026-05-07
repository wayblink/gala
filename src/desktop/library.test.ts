import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLibrarySummary, pickPhotoFolder, scanPhotoSource } from './library'

afterEach(() => {
  vi.restoreAllMocks()
  delete window.__TAURI__
})

describe('library desktop bridge', () => {
  it('returns an empty library summary in web mode', async () => {
    await expect(getLibrarySummary()).resolves.toEqual({
      sources: [],
      totalPhotos: 0,
    })
  })

  it('invokes the native folder picker when Tauri is available', async () => {
    const invoke = vi.fn().mockResolvedValue('/Users/me/Pictures')
    window.__TAURI__ = { core: { invoke } }

    await expect(pickPhotoFolder()).resolves.toBe('/Users/me/Pictures')
    expect(invoke).toHaveBeenCalledWith('pick_photo_folder')
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
    window.__TAURI__ = { core: { invoke } }

    await expect(scanPhotoSource('/Users/me/Pictures')).resolves.toEqual(summary)
    expect(invoke).toHaveBeenCalledWith('scan_photo_source', {
      rootPath: '/Users/me/Pictures',
    })
  })
})
