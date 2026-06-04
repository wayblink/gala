export type BackgroundTaskKind = 'library' | 'similar' | 'people' | 'content' | 'quality' | 'reorganize'

export type BackgroundTaskStatus = 'queued' | 'running' | 'paused' | 'succeeded' | 'failed'

export type BackgroundTask = {
  id: string
  kind: BackgroundTaskKind
  title: string
  description?: string | null
  status: BackgroundTaskStatus
  progressLabel?: string | null
  detail?: string | null
  result?: string | null
  error?: string | null
  operationPayload?: unknown
  resumeCheckpoint?: unknown
  createdAt: string
  startedAt?: string | null
  updatedAt: string
  completedAt?: string | null
}

export type BackgroundTaskSpec = {
  kind: BackgroundTaskKind
  title: string
  description?: string
  /** Durable operation description; future resume handlers can replay from this. */
  operationPayload?: unknown
  /** Durable progress cursor; long-running jobs can update this as they advance. */
  resumeCheckpoint?: unknown
}

export type BackgroundTaskPatch = Partial<Pick<BackgroundTask, 'progressLabel' | 'detail' | 'result' | 'resumeCheckpoint'>>
export type BackgroundTaskUpdater = (patch: BackgroundTaskPatch) => void

export type RunBackgroundTask = <T>(
  spec: BackgroundTaskSpec,
  runner: (update: BackgroundTaskUpdater) => Promise<T>,
) => Promise<T>
