export type DesktopEnvironment = {
  runtime: 'desktop' | 'web'
  platform: string
  engine: 'rust' | 'mock'
}

export async function getDesktopEnvironment(): Promise<DesktopEnvironment> {
  const invoke = window.__TAURI__?.core?.invoke

  if (!invoke) {
    return {
      runtime: 'web',
      platform: 'browser',
      engine: 'mock',
    }
  }

  return invoke<DesktopEnvironment>('get_app_environment')
}
