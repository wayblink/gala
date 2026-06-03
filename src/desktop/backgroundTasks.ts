import { invoke } from '@tauri-apps/api/core'
import type { BackgroundTask } from '../types/backgroundTasks'
import { isTauriAvailable } from './tauri'

export async function listBackgroundTasks(limit = 100): Promise<BackgroundTask[]> {
  if (!isTauriAvailable()) return []
  return await invoke<BackgroundTask[]>('background_tasks_list_cmd', { limit })
}

export async function saveBackgroundTask(task: BackgroundTask): Promise<BackgroundTask> {
  if (!isTauriAvailable()) return task
  return await invoke<BackgroundTask>('background_task_upsert_cmd', { task })
}

export async function clearFinishedBackgroundTasks(): Promise<number> {
  if (!isTauriAvailable()) return 0
  return await invoke<number>('background_tasks_clear_finished_cmd')
}

export async function reconcileBackgroundTasksOnStartup(): Promise<number> {
  if (!isTauriAvailable()) return 0
  return await invoke<number>('background_tasks_reconcile_startup_cmd')
}
