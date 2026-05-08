export function isTauriAvailable() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__?.invoke)
}
