import { invoke } from '@tauri-apps/api/core'

export type DesktopEnvironment = {
  runtime: 'desktop' | 'web'
  platform: string
  engine: 'rust' | 'mock'
}

export async function getDesktopEnvironment(): Promise<DesktopEnvironment> {
  try {
    return await invoke<DesktopEnvironment>('get_app_environment')
  } catch (error) {
    console.warn('[getDesktopEnvironment] Tauri not available, using web fallback')
    return {
      runtime: 'web',
      platform: 'browser',
      engine: 'mock',
    }
  }
}
