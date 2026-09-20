import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectApplePhotos, getApplePhotosStatus, listenToScanProgress, getLibrarySummary, openSourceFolder, pickPhotoFolder, relinkPhotoSource, scanPhotoSource } from './library'
import { deleteSource, renameSource } from './photos'
import { listen } from '@tauri-apps/api/event'
import { getWebMockLibrarySummary } from './webMock'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  delete window.__TAURI_INTERNALS__
})

describe('library desktop bridge', () => {
  it('returns a preview mock library summary in web mode', async () => {
    await expect(getLibrarySummary()).resolves.toEqual(getWebMockLibrarySummary())
  })

  it('uses native PhotoKit status and connection commands', async () => {
    const status = { available: true, authorization: 'authorized', assetCount: 12, sourceId: null, message: null }
    const invoke = vi.fn().mockResolvedValue(status)
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(getApplePhotosStatus()).resolves.toEqual(status)
    await expect(connectApplePhotos()).resolves.toEqual(status)

    expect(invoke).toHaveBeenNthCalledWith(1, 'apple_photos_status_cmd', {}, undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'connect_apple_photos_cmd', {}, undefined)
  })

  it('passes source paths to the native folder opener', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    window.__TAURI_INTERNALS__ = { invoke }

    await openSourceFolder('/Users/me/Pictures')

    expect(invoke).toHaveBeenCalledWith('open_source_folder_cmd', {
      rootPath: '/Users/me/Pictures',
    }, undefined)
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

  it('passes the source id and root path into the native relink command', async () => {
    const summary = {
      source: {
        id: 'source-1',
        name: 'Pictures',
        rootPath: '/Volumes/Archive/Pictures',
        status: 'online',
        photoCount: 2,
      },
      indexedCount: 2,
      skippedCount: 0,
    }
    const invoke = vi.fn().mockResolvedValue(summary)
    window.__TAURI_INTERNALS__ = { invoke }

    await expect(relinkPhotoSource('source-1', '/Volumes/Archive/Pictures')).resolves.toEqual(summary)
    expect(invoke).toHaveBeenCalledWith('relink_photo_source', {
      sourceId: 'source-1',
      rootPath: '/Volumes/Archive/Pictures',
    }, undefined)
  })

  it('invokes native source deletion and rename commands', async () => {
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

  it('subscribes to native scan progress events', async () => {
    const unlisten = vi.fn()
    vi.mocked(listen).mockResolvedValue(unlisten)
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() }
    const onProgress = vi.fn()

    await expect(listenToScanProgress(onProgress)).resolves.toBe(unlisten)

    expect(listen).toHaveBeenCalledWith('gala://scan-progress', expect.any(Function))
  })
})
