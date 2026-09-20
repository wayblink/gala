import { invoke } from '@tauri-apps/api/core'
import type { Album, FilterOptions, PhotoFilter, SmartFilter, SourceCollection, SourceFolder, Tag, Label, TimelinePhoto } from '../types/photos'
import { isTauriAvailable } from './tauri'
import {
  addWebMockPhotoToAlbum,
  addWebMockPhotosToAlbumBatch,
  createWebMockAlbum,
  deleteWebMockAlbum,
  deleteWebMockSource,
  getWebMockAlbumPhotos,
  getWebMockAlbums,
  getWebMockSourceFolders,
  getWebMockTimelinePhotos,
  removeWebMockPhotoFromAlbum,
  removeWebMockPhotosFromAlbumBatch,
  renameWebMockAlbum,
  renameWebMockSource,
  searchWebMockPhotos,
  webMockFilterOptions,
} from './webMock'

export async function getTimelinePhotos(
  limit: number,
  offset: number,
  filter?: PhotoFilter | null,
  mergeVariants = true,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) {
    return getWebMockTimelinePhotos(filter).slice(offset, offset + limit)
  }

  try {
    const sourceId = filter?.type === 'folder' ? filter.sourceId : null
    const folderPath = filter?.type === 'folder' ? filter.folderPath : null
    const args = { limit, offset, sourceId, folderPath } as Record<string, unknown>
    if (!mergeVariants) args.mergeVariants = false
    return await invoke<TimelinePhoto[]>('get_timeline_photos_cmd', args)
  } catch (error) {
    console.error('[getTimelinePhotos] Error:', error)
    return []
  }
}

export async function getRecentlyAddedPhotos(
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return getWebMockTimelinePhotos({ type: 'all' }).slice(offset, offset + limit)

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
  sourceId?: string,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return []

  try {
    return await invoke<TimelinePhoto[]>('get_favorite_photos_cmd', { limit, offset, sourceId: sourceId ?? null })
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
    return searchWebMockPhotos(query).slice(offset, offset + limit)
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

export async function getSourceCollectionPhotos(collectionId: string, limit: number, offset: number): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<TimelinePhoto[]>('get_source_collection_photos_cmd', { collectionId, limit, offset })
  } catch (error) {
    console.error('[getSourceCollectionPhotos] Error:', error)
    return []
  }
}

export async function getSourceCollections(sourceId: string): Promise<SourceCollection[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<SourceCollection[]>('get_source_collections_cmd', { sourceId })
  } catch (error) {
    console.error('[getSourceCollections] Error:', error)
    return []
  }
}

export async function getSourceFolders(): Promise<SourceFolder[]> {
  if (!isTauriAvailable()) {
    return getWebMockSourceFolders()
  }

  try {
    return await invoke<SourceFolder[]>('get_source_folders_cmd')
  } catch (error) {
    console.error('[getSourceFolders] Error:', error)
    return []
  }
}

export async function downloadApplePhotosThumbnail(
  photoId: string,
  size: 'small' | 'medium' | 'large',
): Promise<string | null> {
  if (!isTauriAvailable() || !photoId.startsWith('apple-photos:')) return null

  try {
    return await invoke<string>('download_apple_photos_thumbnail_cmd', { photoId, size })
  } catch (error) {
    console.error('[downloadApplePhotosThumbnail] Error for', photoId, ':', error)
    return null
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

export async function downloadApplePhotosOriginals(photoIds: string[]): Promise<{
  downloaded: number
  failed: number
  paths: Array<{ photoId: string; path: string }>
}> {
  if (!isTauriAvailable()) return { downloaded: 0, failed: photoIds.length, paths: [] }

  try {
    return await invoke<{
      downloaded: number
      failed: number
      paths: Array<{ photoId: string; path: string }>
    }>('download_apple_photos_originals_cmd', { photoIds })
  } catch (error) {
    console.error('[downloadApplePhotosOriginals] Error:', error)
    return { downloaded: 0, failed: photoIds.length, paths: [] }
  }
}

export async function downloadApplePhotosOriginal(photoId: string): Promise<string | null> {
  if (!isTauriAvailable() || !photoId.startsWith('apple-photos:')) return null

  try {
    return await invoke<string>('download_apple_photos_original_cmd', { photoId })
  } catch (error) {
    console.error('[downloadApplePhotosOriginal] Error for', photoId, ':', error)
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

export async function togglePhotoHidden(photoId: string): Promise<boolean> {
  if (!isTauriAvailable()) return false
  return await invoke<boolean>('toggle_photo_hidden_cmd', { photoId })
}

export async function getHiddenPhotos(limit: number, offset: number, sourceId?: string): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<TimelinePhoto[]>('get_hidden_photos_cmd', { limit, offset, sourceId: sourceId ?? null })
  } catch (error) {
    console.error('[getHiddenPhotos] Error:', error)
    return []
  }
}

export async function getFilterOptions(): Promise<FilterOptions | null> {
  if (!isTauriAvailable()) return webMockFilterOptions
  try {
    return await invoke<FilterOptions>('get_filter_options_cmd')
  } catch (error) {
    console.error('[getFilterOptions] Error:', error)
    return null
  }
}

export async function getFilteredPhotos(
  limit: number,
  offset: number,
  filter: SmartFilter,
  sourceId?: string,
  folderPath?: string,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) {
    return getWebMockTimelinePhotos(sourceId ? { type: 'folder', sourceId, folderPath: folderPath ?? '' } : { type: 'all' })
      .slice(offset, offset + limit)
  }
  try {
    return await invoke<TimelinePhoto[]>('get_filtered_photos_cmd', {
      limit,
      offset,
      sourceId: sourceId ?? null,
      folderPath: folderPath ?? null,
      cameras: filter.cameras ?? [],
      dateFrom: filter.dateFrom ?? null,
      dateTo: filter.dateTo ?? null,
      extensions: filter.extensions ?? [],
    })
  } catch (error) {
    console.error('[getFilteredPhotos] Error:', error)
    return []
  }
}

export async function getAlbums(): Promise<Album[]> {
  if (!isTauriAvailable()) return getWebMockAlbums()
  try {
    return await invoke<Album[]>('get_albums_cmd')
  } catch (error) {
    console.error('[getAlbums] Error:', error)
    return []
  }
}

export async function createAlbum(name: string): Promise<Album | null> {
  if (!isTauriAvailable()) return createWebMockAlbum(name)
  try {
    return await invoke<Album>('create_album_cmd', { name })
  } catch (error) {
    console.error('[createAlbum] Error:', error)
    return null
  }
}

export async function deleteAlbum(albumId: string): Promise<void> {
  if (!isTauriAvailable()) {
    deleteWebMockAlbum(albumId)
    return
  }
  await invoke('delete_album_cmd', { albumId })
}

export async function renameAlbum(albumId: string, newName: string): Promise<void> {
  if (!isTauriAvailable()) {
    renameWebMockAlbum(albumId, newName)
    return
  }
  await invoke('rename_album_cmd', { albumId, newName })
}

export async function addPhotoToAlbum(albumId: string, photoId: string): Promise<void> {
  if (!isTauriAvailable()) {
    addWebMockPhotoToAlbum(albumId, photoId)
    return
  }
  await invoke('add_photo_to_album_cmd', { albumId, photoId })
}

export async function removePhotoFromAlbum(albumId: string, photoId: string): Promise<void> {
  if (!isTauriAvailable()) {
    removeWebMockPhotoFromAlbum(albumId, photoId)
    return
  }
  await invoke('remove_photo_from_album_cmd', { albumId, photoId })
}

export async function getAlbumPhotos(
  albumId: string,
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return getWebMockAlbumPhotos(albumId).slice(offset, offset + limit)
  try {
    return await invoke<TimelinePhoto[]>('get_album_photos_cmd', { albumId, limit, offset })
  } catch (error) {
    console.error('[getAlbumPhotos] Error:', error)
    return []
  }
}

export async function getPhotosByPerson(
  personId: string,
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<TimelinePhoto[]>('get_photos_by_person_cmd', { personId, limit, offset })
  } catch (error) {
    console.error('[getPhotosByPerson] Error:', error)
    return []
  }
}

export async function addPhotosToAlbumBatch(albumId: string, photoIds: string[]): Promise<void> {
  if (!isTauriAvailable()) {
    addWebMockPhotosToAlbumBatch(albumId, photoIds)
    return
  }
  await invoke('add_photos_to_album_batch_cmd', { albumId, photoIds })
}

export async function removePhotosFromAlbumBatch(albumId: string, photoIds: string[]): Promise<void> {
  if (!isTauriAvailable()) {
    removeWebMockPhotosFromAlbumBatch(albumId, photoIds)
    return
  }
  await invoke('remove_photos_from_album_batch_cmd', { albumId, photoIds })
}

export async function deleteSource(sourceId: string): Promise<void> {
  if (!sourceId.trim()) throw new Error('Source id cannot be empty')
  if (!isTauriAvailable()) {
    deleteWebMockSource(sourceId)
    return
  }
  await invoke('delete_source_cmd', { sourceId })
}

export async function renameSource(sourceId: string, newName: string): Promise<void> {
  if (!isTauriAvailable()) {
    renameWebMockSource(sourceId, newName)
    return
  }
  await invoke('rename_source_cmd', { sourceId, newName })
}

export async function setPhotosFavoriteBatch(photoIds: string[], favorited: boolean): Promise<void> {
  if (!isTauriAvailable()) return
  await invoke('set_photos_favorite_batch_cmd', { photoIds, favorited })
}

export async function setPhotosHiddenBatch(photoIds: string[], hidden: boolean): Promise<void> {
  if (!isTauriAvailable()) return
  await invoke('set_photos_hidden_batch_cmd', { photoIds, hidden })
}

export async function addTagsToPhotosBatch(photoIds: string[], tags: string[]): Promise<void> {
  if (!isTauriAvailable()) return
  await invoke('add_tags_to_photos_batch_cmd', { photoIds, tags })
}

export async function getPhotoTags(photoId: string): Promise<string[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<string[]>('get_photo_tags_cmd', { photoId })
  } catch (error) {
    console.error('[getPhotoTags] Error:', error)
    return []
  }
}

export async function setPhotoTags(photoId: string, tags: string[]): Promise<string[]> {
  if (!isTauriAvailable()) return []
  return await invoke<string[]>('set_photo_tags_cmd', { photoId, tags })
}

export async function getAllTags(): Promise<Tag[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<Tag[]>('get_all_tags_cmd')
  } catch (error) {
    console.error('[getAllTags] Error:', error)
    return []
  }
}

export async function getPhotosByTag(
  tagName: string,
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<TimelinePhoto[]>('get_photos_by_tag_cmd', { tagName, limit, offset })
  } catch (error) {
    console.error('[getPhotosByTag] Error:', error)
    return []
  }
}



export type ContentLabelMaterializeSummary = {
  photosProcessed: number
  labelsWritten: number
}

export async function materializeContentLabels(
  minConfidence = 0.35,
  sourceId?: string,
): Promise<ContentLabelMaterializeSummary> {
  if (!isTauriAvailable()) return { photosProcessed: 0, labelsWritten: 0 }
  return await invoke<ContentLabelMaterializeSummary>('materialize_content_labels_cmd', {
    minConfidence,
    sourceId: sourceId ?? null,
  })
}

export async function getLabels(kind?: string): Promise<Label[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<Label[]>('get_labels_cmd', { kind: kind ?? null })
  } catch (error) {
    console.error('[getLabels] Error:', error)
    return []
  }
}

export async function getPhotosByLabel(
  labelId: string,
  limit: number,
  offset: number,
): Promise<TimelinePhoto[]> {
  if (!isTauriAvailable()) return []
  try {
    return await invoke<TimelinePhoto[]>('get_photos_by_label_cmd', { labelId, limit, offset })
  } catch (error) {
    console.error('[getPhotosByLabel] Error:', error)
    return []
  }
}

export async function syncPersonLabels(): Promise<number> {
  if (!isTauriAvailable()) return 0
  return await invoke<number>('sync_person_labels_cmd')
}

export async function revealInFinder(photoId: string): Promise<void> {
  if (!isTauriAvailable()) return
  await invoke('reveal_in_finder_cmd', { photoId })
}
