import { invoke } from '@tauri-apps/api/core'
import type { PhotoFilter, SourceFolder, TimelinePhoto } from '../types/photos'
import { isTauriAvailable } from './tauri'

export async function getTimelinePhotos(
  limit: number,
  offset: number,
  filter?: PhotoFilter | null,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) {
    return []
  }

  try {
    const sourceId = filter?.type === 'folder' ? filter.sourceId : null
    const folderPath = filter?.type === 'folder' ? filter.folderPath : null
    return await invoke<TimelinePhoto[]>('get_timeline_photos_cmd', {
      limit,
      offset,
      sourceId,
      folderPath,
    })
  } catch (error) {
    console.error('[getTimelinePhotos] Error:', error)
    return []
  }
}

export async function getRecentlyAddedPhotos(
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) {
    return []
  }

  try {
    return await invoke<TimelinePhoto[]>('get_recently_added_photos_cmd', { limit, offset })
  } catch (error) {
    console.error('[getRecentlyAddedPhotos] Error:', error)
    return []
  }
}

export async function getFavoritePhotos(
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) {
    return []
  }

  try {
    return await invoke<TimelinePhoto[]>('get_favorite_photos_cmd', { limit, offset })
  } catch (error) {
    console.error('[getFavoritePhotos] Error:', error)
    return []
  }
}

export async function searchPhotos(
  query: string,
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) {
    return []
  }

  try {
    return await invoke<TimelinePhoto[]>('search_photos_cmd', { query, limit, offset })
  } catch (error) {
    console.error('[searchPhotos] Error:', error)
    return []
  }
}

export async function togglePhotoFavorite(photoId: string): Promise<boolean> {
  if (!isTauriAvailable()) {
    return false
  }

  return await invoke<boolean>('toggle_photo_favorite_cmd', { photoId })
}

export async function getSourceFolders(): Promise<SourceFolder[]> {
  if (!isTauriAvailable()) {
    return []
  }

  try {
    return await invoke<SourceFolder[]>('get_source_folders_cmd')
  } catch (error) {
    console.error('[getSourceFolders] Error:', error)
    return []
  }
}

export async function getThumbnailFile(
  photoId: string,
  size: 'small' | 'medium' | 'large',
): Promise<string | null> {
  if (!isTauriAvailable()) {
    return null
  }

  try {
    return await invoke<string>('get_thumbnail_file', { photoId, size })
  } catch (error) {
    return null
  }
}

export async function getPhotoDataUrl(photoId: string): Promise<string | null> {
  if (!isTauriAvailable()) {
    return null
  }

  try {
    return await invoke<string>('get_photo_data_url', { photoId })
  } catch (error) {
    console.error('[getPhotoDataUrl] Error for', photoId, ':', error)
    return null
  }
}
