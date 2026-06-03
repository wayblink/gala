import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearFinishedBackgroundTasks,
  listBackgroundTasks,
  reconcileBackgroundTasksOnStartup,
  saveBackgroundTask,
} from '../desktop/backgroundTasks'
import type {
  BackgroundTask,
  BackgroundTaskSpec,
  BackgroundTaskUpdater,
  RunBackgroundTask,
} from '../types/backgroundTasks'

const makeTaskId = () => `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const nowIso = () => new Date().toISOString()

export function useBackgroundTasks() {
  const [tasks, setTasks] = useState<BackgroundTask[]>([])
  const tasksRef = useRef<BackgroundTask[]>([])

  const replaceTasks = (next: BackgroundTask[]) => {
    tasksRef.current = next
    setTasks(next)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await reconcileBackgroundTasksOnStartup()
        const persisted = await listBackgroundTasks(100)
        if (!cancelled) replaceTasks(persisted)
      } catch (err) {
        console.warn('[background-tasks] load failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persist = (task: BackgroundTask) => {
    void saveBackgroundTask(task).catch((err) => {
      console.warn('[background-tasks] persist failed:', err)
    })
  }

  const patchTask = (id: string, patch: Partial<BackgroundTask>) => {
    const existing = tasksRef.current.find((task) => task.id === id)
    if (!existing) return
    const nextTask: BackgroundTask = { ...existing, ...patch, updatedAt: nowIso() }
    replaceTasks(tasksRef.current.map((task) => (task.id === id ? nextTask : task)))
    persist(nextTask)
  }

  const runBackgroundTask: RunBackgroundTask = async <T,>(
    spec: BackgroundTaskSpec,
    runner: (update: BackgroundTaskUpdater) => Promise<T>,
  ): Promise<T> => {
    const now = nowIso()
    const id = makeTaskId()
    const task: BackgroundTask = {
      id,
      kind: spec.kind,
      title: spec.title,
      description: spec.description,
      status: 'running',
      progressLabel: 'Starting…',
      operationPayload: spec.operationPayload,
      resumeCheckpoint: spec.resumeCheckpoint,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
    }
    replaceTasks([task, ...tasksRef.current])
    persist(task)

    const update: BackgroundTaskUpdater = (patch) => patchTask(id, patch)

    try {
      const result = await runner(update)
      patchTask(id, {
        status: 'succeeded',
        progressLabel: 'Complete',
        completedAt: nowIso(),
      })
      return result
    } catch (error) {
      patchTask(id, {
        status: 'failed',
        progressLabel: 'Failed',
        error: String(error),
        completedAt: nowIso(),
      })
      throw error
    }
  }

  const clearCompleted = () => {
    replaceTasks(tasksRef.current.filter((task) => task.status !== 'succeeded' && task.status !== 'failed'))
    void clearFinishedBackgroundTasks().catch((err) => {
      console.warn('[background-tasks] clear failed:', err)
    })
  }

  const summary = useMemo(() => {
    const active = tasks.filter((task) => task.status === 'queued' || task.status === 'running').length
    const paused = tasks.filter((task) => task.status === 'paused').length
    const failed = tasks.filter((task) => task.status === 'failed').length
    return { active, paused, failed, total: tasks.length }
  }, [tasks])

  return {
    tasks,
    summary,
    runBackgroundTask,
    clearCompleted,
  }
}
