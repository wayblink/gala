import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ApplePhotosStatus, LibrarySummary, ScanProgress, ScanSummary } from '../types/library'
import { isTauriAvailable } from './tauri'
import { getWebMockLibrarySummary } from './webMock'

export const SCAN_PROGRESS_EVENT = 'gala://scan-progress'

export async function getApplePhotosStatus(): Promise<ApplePhotosStatus> {
  if (!isTauriAvailable()) {
    return { available: false, authorization: 'unsupported', assetCount: 0, sourceId: null, message: 'Apple Photos is available in the macOS desktop app.' }
  }
  return invoke<ApplePhotosStatus>('apple_photos_status_cmd')
}

export async function connectApplePhotos(): Promise<ApplePhotosStatus> {
  if (!isTauriAvailable()) throw new Error('Apple Photos is available in the macOS desktop app.')
  return invoke<ApplePhotosStatus>('connect_apple_photos_cmd')
}

export async function pickPhotoFolder(): Promise<string | null> {
  if (!isTauriAvailable()) {
    return null
  }

  try {
    console.log('[pickPhotoFolder] Calling pick_photo_folder command')
    const result = await invoke<string | null>('pick_photo_folder')
    console.log('[pickPhotoFolder] Result:', result)
    return result
  } catch (error) {
    console.error('[pickPhotoFolder] Error:', error)
    return null
  }
}

export async function scanPhotoSource(rootPath: string): Promise<ScanSummary | null> {
  if (!isTauriAvailable()) {
    return null
  }

  try {
    console.log('[scanPhotoSource] Calling scan_photo_source with:', rootPath)
    const result = await invoke<ScanSummary>('scan_photo_source', { rootPath })
    console.log('[scanPhotoSource] Result:', result)
    return result
  } catch (error) {
    console.error('[scanPhotoSource] Error:', error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function relinkPhotoSource(sourceId: string, rootPath: string): Promise<ScanSummary | null> {
  if (!isTauriAvailable()) {
    return null
  }

  try {
    console.log('[relinkPhotoSource] Calling relink_photo_source with:', sourceId, rootPath)
    const result = await invoke<ScanSummary>('relink_photo_source', { sourceId, rootPath })
    console.log('[relinkPhotoSource] Result:', result)
    return result
  } catch (error) {
    console.error('[relinkPhotoSource] Error:', error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function listenToScanProgress(
  onProgress: (progress: ScanProgress) => void,
): Promise<UnlistenFn | null> {
  if (!isTauriAvailable()) {
    return null
  }

  return listen<ScanProgress>(SCAN_PROGRESS_EVENT, (event) => {
    onProgress(event.payload)
  })
}

export async function openSourceFolder(rootPath: string): Promise<void> {
  if (!isTauriAvailable()) return
  await invoke('open_source_folder_cmd', { rootPath })
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  if (!isTauriAvailable()) {
    return getWebMockLibrarySummary()
  }

  try {
    console.log('[getLibrarySummary] Calling get_library_summary')
    const result = await invoke<LibrarySummary>('get_library_summary')
    console.log('[getLibrarySummary] Result:', result)
    return result
  } catch (error) {
    console.error('[getLibrarySummary] Error:', error)
    return { sources: [], totalPhotos: 0, recentlyAddedCount: 0, favoritesCount: 0, hiddenCount: 0 }
  }
}
