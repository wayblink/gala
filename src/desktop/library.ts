import type { LibrarySummary, ScanSummary } from '../types/library'

function invokeOrNull() {
  return window.__TAURI__?.core?.invoke
}

export async function pickPhotoFolder(): Promise<string | null> {
  const invoke = invokeOrNull()
  if (!invoke) return null
  return invoke<string | null>('pick_photo_folder')
}

export async function scanPhotoSource(rootPath: string): Promise<ScanSummary | null> {
  const invoke = invokeOrNull()
  if (!invoke) return null
  return invoke<ScanSummary>('scan_photo_source', { rootPath })
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  const invoke = invokeOrNull()
  if (!invoke) return { sources: [], totalPhotos: 0 }
  return invoke<LibrarySummary>('get_library_summary')
}
