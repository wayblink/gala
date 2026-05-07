import { invoke } from '@tauri-apps/api/core'
import type { TimelinePhoto } from '../types/photos'

export async function getTimelinePhotos(
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  try {
    return await invoke<TimelinePhoto[]>('get_timeline_photos_cmd', { limit, offset })
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
    return await invoke<string>('get_thumbnail_file', { photoId, size })
  } catch (error) {
    return null
  }
}
