import type { ScopeKind } from '../desktop/capability'
import type { LibrarySource } from './library'

export type AnalysisScope =
  | { kind: 'all' }
  | { kind: 'source'; sourceId: string; sourceName: string }

export function defaultAnalysisScope(): AnalysisScope {
  return { kind: 'all' }
}

export function analysisScopeLabel(scope: AnalysisScope): string {
  return scope.kind === 'all' ? 'All Library' : scope.sourceName
}

export function analysisScopeToRequest(scope: AnalysisScope): { scope_kind: ScopeKind; scope_id?: string } {
  if (scope.kind === 'source') return { scope_kind: 'source', scope_id: scope.sourceId }
  return { scope_kind: 'all' }
}

export function analysisScopePayload(scope: AnalysisScope) {
  return scope.kind === 'source'
    ? { scopeKind: 'source', scopeId: scope.sourceId, scopeLabel: scope.sourceName }
    : { scopeKind: 'all', scopeLabel: 'All Library' }
}

export function ensureScopeAvailable(scope: AnalysisScope, sources: LibrarySource[]): AnalysisScope {
  if (scope.kind === 'all') return scope
  const source = sources.find((item) => item.id === scope.sourceId)
  return source ? { kind: 'source', sourceId: source.id, sourceName: source.name } : defaultAnalysisScope()
}
