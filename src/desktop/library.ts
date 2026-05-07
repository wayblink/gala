import type { LibrarySummary, ScanSummary } from '../types/library'

function invokeOrNull() {
  return window.__TAURI__?.core?.invoke
}

export async function pickPhotoFolder(): Promise<string | null> {
  const invoke = invokeOrNull()
  console.log('[pickPhotoFolder] Tauri available:', !!invoke)
  if (!invoke) {
    console.warn('[pickPhotoFolder] Tauri not available, returning null')
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
  const invoke = invokeOrNull()
  console.log('[scanPhotoSource] Tauri available:', !!invoke)
  if (!invoke) {
    console.warn('[scanPhotoSource] Tauri not available')
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

export async function getLibrarySummary(): Promise<LibrarySummary> {
  const invoke = invokeOrNull()
  console.log('[getLibrarySummary] Tauri available:', !!invoke)
  if (!invoke) {
    console.warn('[getLibrarySummary] Tauri not available, returning empty')
    return { sources: [], totalPhotos: 0 }
  }
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
  const invoke = invokeOrNull()
  if (!invoke) return []
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
  const invoke = invokeOrNull()
  if (!invoke) return null
  try {
    const result = await invoke<string>('get_thumbnail_file', { photoId, size })
    return result
  } catch (error) {
    console.error('[getThumbnailFile] Error for', photoId, ':', error)
    return null
  }
}
