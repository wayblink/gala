import { invoke } from '@tauri-apps/api/core'
import { isTauriAvailable } from './tauri'

export type ReorganizeMode = 'move'
export type ReorganizeCollisionStrategy = 'keep_both' | 'skip' | 'overwrite'

export type ReorganizePlanOptions = {
  sourceRoots?: string[]
  targetRoot: string
  pattern: string
  mode: ReorganizeMode
  collisionStrategy: ReorganizeCollisionStrategy
  limit?: number | null
}

export type ReorganizeTreeNode = {
  name: string
  path: string
  count: number
  children: ReorganizeTreeNode[]
}

export type ReorganizePlanEntry = {
  photoId: string
  fileName: string
  sourcePath: string
  targetPath: string
  beforeDir: string
  afterDir: string
  action: string
  conflict: boolean
  sourceFingerprint?: string | null
}

export type ReorganizePlan = {
  id: string
  options: ReorganizePlanOptions
  totalPhotos: number
  plannedCount: number
  skippedCount: number
  conflictCount: number
  beforeTree: ReorganizeTreeNode[]
  afterTree: ReorganizeTreeNode[]
  entries: ReorganizePlanEntry[]
}

export type ReorganizeExecuteSummary = {
  attempted: number
  completed: number
  failed: number
  skipped: number
  errors: string[]
}

export async function scanReorganizePlan(options: ReorganizePlanOptions): Promise<ReorganizePlan> {
  if (!isTauriAvailable()) {
    return {
      id: 'preview-unavailable',
      options,
      totalPhotos: 0,
      plannedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      beforeTree: [],
      afterTree: [],
      entries: [],
    }
  }
  return await invoke<ReorganizePlan>('reorganize_scan_plan_cmd', { options })
}

export async function executeReorganizePlan(
  planId: string,
  entries: ReorganizePlanEntry[],
  mode: ReorganizeMode,
  collisionStrategy: ReorganizeCollisionStrategy,
  targetRoot: string,
): Promise<ReorganizeExecuteSummary> {
  if (!isTauriAvailable()) {
    return { attempted: 0, completed: 0, failed: 0, skipped: 0, errors: [] }
  }
  return await invoke<ReorganizeExecuteSummary>('reorganize_execute_plan_cmd', {
    planId,
    entries,
    mode,
    collisionStrategy,
    targetRoot,
  })
}

export async function continueReorganizePlan(planId: string): Promise<ReorganizeExecuteSummary> {
  if (!isTauriAvailable()) return { attempted: 0, completed: 0, failed: 0, skipped: 0, errors: [] }
  return await invoke<ReorganizeExecuteSummary>('reorganize_continue_cmd', { planId })
}

export async function rollbackReorganizePlan(planId: string): Promise<ReorganizeExecuteSummary> {
  if (!isTauriAvailable()) return { attempted: 0, completed: 0, failed: 0, skipped: 0, errors: [] }
  return await invoke<ReorganizeExecuteSummary>('reorganize_rollback_cmd', { planId })
}
