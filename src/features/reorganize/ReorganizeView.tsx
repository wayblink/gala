import { useMemo, useState } from 'react'
import { ThemedSelect } from '../../components/ThemedSelect'
import { continueReorganizePlan, executeReorganizePlan, rollbackReorganizePlan, scanReorganizePlan } from '../../desktop/reorganize'
import type {
  ReorganizeCollisionStrategy,
  ReorganizeMode,
  ReorganizePlan,
  ReorganizeTreeNode,
} from '../../desktop/reorganize'
import type { RunBackgroundTask } from '../../types/backgroundTasks'
import type { LibrarySource } from '../../types/library'

const DEFAULT_PATTERNS = [
  { label: 'By month', value: '{year}/{month}' },
  { label: 'By day', value: '{year}/{month}-{day}' },
  { label: 'Source → month', value: '{source}/{year}/{month}' },
  { label: 'Camera → month', value: '{camera}/{year}/{month}' },
]

type ReorganizeViewProps = {
  onPickTargetRoot: () => Promise<string | null>
  runBackgroundTask: RunBackgroundTask
  onExecuted?: () => Promise<void> | void
  sources: LibrarySource[]
}

export function ReorganizeView({ onPickTargetRoot, runBackgroundTask, onExecuted, sources }: ReorganizeViewProps) {
  const [targetRoot, setTargetRoot] = useState('')
  const [pattern, setPattern] = useState(DEFAULT_PATTERNS[0].value)
  const mode: ReorganizeMode = 'move'
  const [collisionStrategy, setCollisionStrategy] = useState<ReorganizeCollisionStrategy>('keep_both')
  const [limit, setLimit] = useState('')
  const [plan, setPlan] = useState<ReorganizePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [executeArmed, setExecuteArmed] = useState(false)
  const [runStatus, setRunStatus] = useState<'idle' | 'paused' | 'succeeded' | 'rolled_back'>('idle')
  const [selectedSourceRoots, setSelectedSourceRoots] = useState<string[]>([])

  const effectiveLimit = useMemo(() => {
    const parsed = Number.parseInt(limit, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }, [limit])

  const handlePickTarget = async () => {
    const picked = await onPickTargetRoot()
    if (picked) {
      setTargetRoot(picked)
      setPlan(null)
      setExecuteArmed(false)
    }
  }

  const handleScan = async () => {
    if (!targetRoot.trim()) return
    setBusy(true)
    setExecuteArmed(false)
    try {
      const nextPlan = await runBackgroundTask(
        {
          kind: 'reorganize',
          title: 'Scan reorganize plan',
          description: pattern,
          operationPayload: { command: 'reorganizeScanPlan', sourceRoots: selectedSourceRoots, targetRoot, pattern, mode, collisionStrategy, limit: effectiveLimit },
        },
        async (update) => {
          update({ progressLabel: 'Scanning library…', detail: `Target: ${targetRoot}` })
          const result = await scanReorganizePlan({
            targetRoot,
            sourceRoots: selectedSourceRoots,
            pattern,
            mode,
            collisionStrategy,
            limit: effectiveLimit,
          })
          update({
            result: `${result.plannedCount} planned · ${result.conflictCount} conflicts · ${result.skippedCount} skipped`,
          })
          return result
        },
      )
      setPlan(nextPlan)
      setRunStatus('idle')
    } finally {
      setBusy(false)
    }
  }

  const handleExecute = async () => {
    if (!plan || !executeArmed) return
    const confirmed = window.confirm(
      `Move ${plan.plannedCount} files into ${plan.options.targetRoot}?`,
    )
    if (!confirmed) return

    setBusy(true)
    try {
      const summary = await runBackgroundTask(
        {
          kind: 'reorganize',
          title: 'Move reorganize plan',
          description: plan.options.pattern,
          operationPayload: {
            command: 'reorganizeExecutePlan',
            planId: plan.id,
            mode: plan.options.mode,
            collisionStrategy: plan.options.collisionStrategy,
            targetRoot: plan.options.targetRoot,
            totalEntries: plan.entries.length,
          },
          resumeCheckpoint: { completed: 0, failed: 0, skipped: 0 },
        },
        async (update) => {
          update({ progressLabel: 'Executing…', detail: `${plan.entries.length} planned file operations` })
          const result = await executeReorganizePlan(
            plan.id,
            plan.entries,
            plan.options.mode,
            plan.options.collisionStrategy,
            plan.options.targetRoot,
          )
          update({
            result: `${result.completed} complete · ${result.failed} failed · ${result.skipped} skipped`,
          })
          return result
        },
      )
      setExecuteArmed(false)
      setRunStatus(summary.failed > 0 ? 'paused' : 'succeeded')
      if (summary.completed > 0) await onExecuted?.()
    } finally {
      setBusy(false)
    }
  }

  const handleContinue = async () => {
    if (!plan) return
    setBusy(true)
    try {
      const summary = await continueReorganizePlan(plan.id)
      setRunStatus(summary.failed > 0 ? 'paused' : 'succeeded')
      if (summary.completed > 0) await onExecuted?.()
    } finally { setBusy(false) }
  }

  const handleRollback = async () => {
    if (!plan) return
    setBusy(true)
    try {
      const summary = await rollbackReorganizePlan(plan.id)
      setRunStatus(summary.failed > 0 ? 'paused' : 'rolled_back')
      if (summary.completed > 0) await onExecuted?.()
    } finally { setBusy(false) }
  }

  return (
    <main className="reorg-view" aria-label="Reorganize photos">
      <header className="reorg-view__header">
        <div>
          <p className="reorg-view__eyebrow">Workflow</p>
          <h1>Reorganize</h1>
        </div>
      </header>

      <section className="reorg-config" aria-label="Reorganize rules">
        <div className="reorg-field reorg-field--wide">
          <label>Source folders</label>
          <div className="reorg-sources" aria-label="Source folders">
            {sources.filter((source) => source.sourceKind !== 'apple_photos').map((source) => (
              <label key={source.id}>
                <input
                  type="checkbox"
                  checked={selectedSourceRoots.length === 0 || selectedSourceRoots.includes(source.rootPath)}
                  onChange={(event) => setSelectedSourceRoots((current) => {
                    const all = sources.filter((item) => item.sourceKind !== 'apple_photos').map((item) => item.rootPath)
                    const base = current.length === 0 ? all : current
                    return event.target.checked ? [...new Set([...base, source.rootPath])] : base.filter((root) => root !== source.rootPath)
                  })}
                />
                <span>{source.name}</span>
              </label>
            ))}
          </div>
          <small>Apple Photos is read-only and cannot be organized here.</small>
        </div>

        <div className="reorg-field reorg-field--wide">
          <label>Target root</label>
          <div className="reorg-target-row">
            <input value={targetRoot} onChange={(e) => { setTargetRoot(e.target.value); setPlan(null); }} placeholder="Choose an output folder…" />
            <button type="button" onClick={handlePickTarget}>Choose…</button>
          </div>
        </div>

        <div className="reorg-field">
          <label>Rule preset</label>
          <ThemedSelect
            value={pattern}
            options={DEFAULT_PATTERNS.map((item) => ({ value: item.value, label: item.label }))}
            ariaLabel="Rule preset"
            onChange={(next) => { setPattern(next); setPlan(null); }}
          />
        </div>

        <div className="reorg-field reorg-field--wide">
          <label>Custom pattern</label>
          <input value={pattern} onChange={(e) => { setPattern(e.target.value); setPlan(null); }} />
          <small>Tokens: {'{year}'}, {'{month}'}, {'{day}'}, {'{source}'}, {'{camera}'}, {'{lens}'}, {'{ext}'}</small>
        </div>

        <div className="reorg-field">
          <label>Conflicts</label>
          <ThemedSelect
            value={collisionStrategy}
            options={[
              { value: 'keep_both', label: 'Keep both / rename' },
              { value: 'skip', label: 'Skip existing' },
              { value: 'overwrite', label: 'Overwrite' },
            ]}
            ariaLabel="Conflicts"
            onChange={(next) => { setCollisionStrategy(next as ReorganizeCollisionStrategy); setPlan(null); }}
          />
        </div>

        <div className="reorg-field">
          <label>Limit</label>
          <input value={limit} onChange={(e) => { setLimit(e.target.value); setPlan(null); }} placeholder="All photos" inputMode="numeric" />
        </div>

        <div className="reorg-config__actions">
          <button type="button" onClick={() => void handleScan()} disabled={busy || !targetRoot.trim()}>
            {busy ? 'Working…' : 'Scan plan'}
          </button>
        </div>
      </section>

      {plan ? (
        <section className="reorg-plan" aria-label="Reorganize plan">
          <div className="reorg-plan__summary">
            <div><strong>{plan.plannedCount}</strong><span>planned</span></div>
            <div><strong>{plan.conflictCount}</strong><span>conflicts</span></div>
            <div><strong>{plan.skippedCount}</strong><span>skipped</span></div>
            <div><strong>{plan.totalPhotos}</strong><span>scanned</span></div>
          </div>

          <div className="reorg-tree-grid">
            <TreePanel title="Before" nodes={plan.beforeTree} />
            <TreePanel title="After" nodes={plan.afterTree} />
          </div>

          <div className="reorg-preview">
            <h2>Sample operations</h2>
            <div className="reorg-preview__list">
              {plan.entries.slice(0, 8).map((entry) => (
                <div className="reorg-preview__row" key={`${entry.photoId}:${entry.targetPath}`}>
                  <span>{entry.fileName}</span>
                  <code>{entry.beforeDir || 'source root'} → {entry.afterDir}</code>
                  <em>{entry.action}{entry.conflict ? ' · conflict' : ''}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="reorg-confirm">
            <label>
              <input type="checkbox" checked={executeArmed} onChange={(e) => setExecuteArmed(e.target.checked)} />
              I reviewed the plan and want to move originals.
            </label>
            <button type="button" onClick={() => void handleExecute()} disabled={busy || !executeArmed || plan.plannedCount === 0}>
              Execute plan
            </button>
            {runStatus === 'paused' ? <>
              <button type="button" onClick={() => void handleContinue()} disabled={busy}>Continue</button>
              <button type="button" onClick={() => void handleRollback()} disabled={busy}>Rollback</button>
            </> : null}
            {runStatus === 'succeeded' ? <span className="mono-muted">Completed</span> : null}
            {runStatus === 'rolled_back' ? <span className="mono-muted">Rolled back</span> : null}
          </div>
        </section>
      ) : (
        <section className="reorg-empty">
          <h2>No plan yet</h2>
          <p>Select a target root and scan. Gala will show the source tree and proposed output tree before touching files.</p>
        </section>
      )}
    </main>
  )
}

function TreePanel({ title, nodes }: { title: string; nodes: ReorganizeTreeNode[] }) {
  return (
    <section className="reorg-tree-panel">
      <h2>{title}</h2>
      {nodes.length === 0 ? <p className="mono-muted">Empty</p> : <TreeList nodes={nodes} />}
    </section>
  )
}

function TreeList({ nodes, depth = 0 }: { nodes: ReorganizeTreeNode[]; depth?: number }) {
  return (
    <ul className="reorg-tree">
      {nodes.map((node) => (
        <li key={node.path || node.name}>
          <div className="reorg-tree__row" style={{ paddingLeft: `${depth * 14}px` }}>
            <span>{node.name}</span>
            <em>{node.count}</em>
          </div>
          {node.children.length > 0 ? <TreeList nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  )
}
