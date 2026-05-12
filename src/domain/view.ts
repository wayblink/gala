export type View = {
  id: string
  kind: string
  sourceFactIds: string[]
  state: 'active' | 'stale' | 'archived'
}

export function buildViewId(kind: string, sourceId: string): string {
  return `${kind}:${sourceId}`
}

export function isView(value: unknown): value is View {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    Array.isArray(v.sourceFactIds) &&
    v.sourceFactIds.every((x) => typeof x === 'string') &&
    (v.state === 'active' || v.state === 'stale' || v.state === 'archived')
  )
}
