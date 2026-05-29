import { invoke } from '@tauri-apps/api/core'
import { isTauriAvailable } from './tauri'

export type ScopeKind = 'photo' | 'source' | 'all'

export interface AnalysisRequest {
  capability: string
  provider_id?: string
  scope_kind: ScopeKind
  scope_id?: string
  priority?: number
  config?: Record<string, unknown>
  force?: boolean
}

export interface RunSummary {
  job_id: string
  outcome: string
  photos_done: number
  photos_failed: number
  photos_skipped: number
  error_message?: string
}

export interface AnalysisJob {
  id: string
  capability: string
  provider_id: string
  schema_version: number
  scope_kind: string
  scope_id?: string
  status: string
  priority: number
  photos_total: number
  photos_done: number
  photos_failed: number
  photos_skipped: number
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
}

export interface AnalysisResult {
  photo_id: string
  capability: string
  provider_id: string
  schema_version: number
  result: unknown
  confidence?: number
  generated_at: string
}

export interface CapabilityDescriptor {
  provider_id: string
  capabilities: string[]
}

export interface FaceSummary {
  total_faces: number
  photos_with_faces: number
  unassigned_faces: number
  faces_with_embedding: number
}

export interface EmbedSummary {
  photos_processed: number
  faces_embedded: number
  faces_failed: number
  faces_skipped: number
}

export interface Face {
  id: string
  photo_id: string
  detected_by: string
  bbox_x: number
  bbox_y: number
  bbox_w: number
  bbox_h: number
  confidence: number
  person_id: string | null
  thumbnail_path: string | null
  file_name: string | null
  embedding_dim: number | null
}

export async function analysisRequest(request: AnalysisRequest): Promise<RunSummary> {
  if (!isTauriAvailable()) {
    throw new Error('Tauri not available')
  }
  return await invoke<RunSummary>('analysis_request_cmd', { request })
}

export async function analysisJob(id: string): Promise<AnalysisJob | null> {
  if (!isTauriAvailable()) {
    return null
  }
  return await invoke<AnalysisJob | null>('analysis_job_cmd', { id })
}

export async function analysisResults(
  photoId?: string,
  capability?: string,
  limit?: number,
): Promise<AnalysisResult[]> {
  if (!isTauriAvailable()) {
    return []
  }
  return await invoke<AnalysisResult[]>('analysis_results_cmd', {
    photoId,
    capability,
    limit,
  })
}

export async function capabilitiesList(): Promise<CapabilityDescriptor[]> {
  if (!isTauriAvailable()) {
    return []
  }
  return await invoke<CapabilityDescriptor[]>('capabilities_list_cmd')
}

export async function facesSummary(): Promise<FaceSummary> {
  if (!isTauriAvailable()) {
    return {
      total_faces: 0,
      photos_with_faces: 0,
      unassigned_faces: 0,
      faces_with_embedding: 0,
    }
  }
  return await invoke<FaceSummary>('faces_summary_cmd')
}

export async function facesList(limit?: number): Promise<Face[]> {
  if (!isTauriAvailable()) {
    return []
  }
  return await invoke<Face[]>('faces_list_cmd', { limit })
}

export async function analysisEmbedFaces(limit?: number): Promise<EmbedSummary> {
  if (!isTauriAvailable()) {
    return { photos_processed: 0, faces_embedded: 0, faces_failed: 0, faces_skipped: 0 }
  }
  return await invoke<EmbedSummary>('analysis_embed_faces_cmd', { limit })
}
