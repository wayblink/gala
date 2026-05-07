import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDesktopEnvironment } from './environment'

const originalTauri = window.__TAURI__

describe('getDesktopEnvironment', () => {
  afterEach(() => {
    window.__TAURI__ = originalTauri
    vi.restoreAllMocks()
  })

  it('returns a web fallback when the app is not running inside Tauri', async () => {
    window.__TAURI__ = undefined

    await expect(getDesktopEnvironment()).resolves.toEqual({
      runtime: 'web',
      platform: 'browser',
      engine: 'mock',
    })
  })

  it('invokes the Rust command when running inside Tauri', async () => {
    const invoke = vi.fn().mockResolvedValue({
      runtime: 'desktop',
      platform: 'macos',
      engine: 'rust',
    })

    window.__TAURI__ = {
      core: { invoke },
    }

    await expect(getDesktopEnvironment()).resolves.toEqual({
      runtime: 'desktop',
      platform: 'macos',
      engine: 'rust',
    })
    expect(invoke).toHaveBeenCalledWith('get_app_environment')
  })
})
