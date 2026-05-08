/// <reference types="vite/client" />

interface Window {
  __TAURI__?: {
    core?: {
      invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
    }
  }
  __TAURI_INTERNALS__?: {
    invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  }
}
