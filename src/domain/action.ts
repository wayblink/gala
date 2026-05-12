export type Action = {
  id: string
  kind: string
  targetId: string
  reversible: boolean
}

export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.targetId === 'string' &&
    typeof v.reversible === 'boolean'
  )
}
