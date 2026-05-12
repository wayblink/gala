export type Fact = {
  id: string
  kind: string
  source: string
  createdAt: string
  payload: unknown
}

export function isFact(value: unknown): value is Fact {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.source === 'string' &&
    typeof v.createdAt === 'string' &&
    'payload' in v
  )
}
