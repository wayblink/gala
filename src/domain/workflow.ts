export type Workflow = {
  id: string
  kind: string
  stepKinds: string[]
  requiresConfirmation: boolean
}

export function isWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    Array.isArray(v.stepKinds) &&
    v.stepKinds.every((x) => typeof x === 'string') &&
    typeof v.requiresConfirmation === 'boolean'
  )
}
