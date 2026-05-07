import type { TimelinePhoto } from '../types/photos'

function invokeOrNull() {
  return window.__TAURI__?.core?.invoke
}

export async function getTimelinePhotos(
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  const invoke = invokeOrNull()
  if (!invoke) return []
  return invoke<TimelinePhoto[]>('get_timeline_photos_cmd', { limit, offset })
}

export async function getThumbnailFile(
  photoId: string,
  size: 'small' | 'medium' | 'large',
): Promise<string | null> {
  const invoke = invokeOrNull()
  if (!invoke) return null
  try {
    return await invoke<string>('get_thumbnail_file', { photoId, size })
  } catch {
    return null
  }
}
