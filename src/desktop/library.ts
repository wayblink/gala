import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { LibrarySummary, ScanProgress, ScanSummary } from '../types/library'
import { isTauriAvailable } from './tauri'

export const SCAN_PROGRESS_EVENT = 'gala://scan-progress'

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
    return null
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
    return null
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

export async function getLibrarySummary(): Promise<LibrarySummary> {
  if (!isTauriAvailable()) {
    return { sources: [], totalPhotos: 0, recentlyAddedCount: 0, favoritesCount: 0, hiddenCount: 0 }
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

export async function getTimelinePhotos(
  limit: number,
  offset: number,
): Promise<any[]> {
  try {
    console.log('[getTimelinePhotos] Calling with limit:', limit, 'offset:', offset)
    const result = await invoke<any[]>('get_timeline_photos_cmd', { limit, offset })
    console.log('[getTimelinePhotos] Got', result.length, 'photos')
    return result
  } catch (error) {
    console.error('[getTimelinePhotos] Error:', error)
    return []
  }
}

export async function getThumbnailFile(
  photoId: string,
  size: 'small' | 'medium' | 'large',
): Promise<string | null> {
  try {
    const result = await invoke<string>('get_thumbnail_file', { photoId, size })
    return result
  } catch (error) {
    console.error('[getThumbnailFile] Error for', photoId, ':', error)
    return null
  }
}
