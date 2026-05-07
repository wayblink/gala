import { invoke } from '@tauri-apps/api/core'
import type { LibrarySummary, ScanSummary } from '../types/library'

export async function pickPhotoFolder(): Promise<string | null> {
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

export async function getLibrarySummary(): Promise<LibrarySummary> {
  try {
    console.log('[getLibrarySummary] Calling get_library_summary')
    const result = await invoke<LibrarySummary>('get_library_summary')
    console.log('[getLibrarySummary] Result:', result)
    return result
  } catch (error) {
    console.error('[getLibrarySummary] Error:', error)
    return { sources: [], totalPhotos: 0 }
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
