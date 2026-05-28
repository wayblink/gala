import { useEffect, useState } from 'react'
import { analysisRequest, analysisResults, capabilitiesList } from '../../desktop/capability'
import type { AnalysisResult, CapabilityDescriptor } from '../../desktop/capability'

export function PeopleView() {
  const [providers, setProviders] = useState<CapabilityDescriptor[]>([])
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [results, setResults] = useState<AnalysisResult[]>([])

  useEffect(() => {
    void capabilitiesList().then(setProviders)
  }, [])

  const handleRunDetection = async () => {
    setRunning(true)
    setSummary(null)
    try {
      const runSummary = await analysisRequest({
        capability: 'face.detect',
        scope_kind: 'all',
        priority: 0,
        force: false,
      })
      setSummary(
        `Job ${runSummary.job_id}: ${runSummary.outcome} — ` +
          `${runSummary.photos_done} done, ${runSummary.photos_failed} failed, ${runSummary.photos_skipped} skipped`,
      )
      // Refresh results after run completes
      const fresh = await analysisResults(undefined, 'face.detect', 20)
      setResults(fresh)
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  const handleLoadResults = async () => {
    try {
      const fresh = await analysisResults(undefined, 'face.detect', 20)
      setResults(fresh)
    } catch (err) {
      console.error('Failed to load results:', err)
    }
  }

  return (
    <div className="people-view">
      <div className="people-view__header">
        <h2>People (M1.3a — NoopProvider)</h2>
        <div className="people-view__actions">
          <button onClick={handleRunDetection} disabled={running}>
            {running ? 'Running...' : 'Run face.detect (all photos)'}
          </button>
          <button onClick={handleLoadResults}>Load Results</button>
        </div>
      </div>

      {providers.length > 0 && (
        <div className="people-view__providers">
          <strong>Registered providers:</strong>
          {providers.map((p) => (
            <div key={p.provider_id}>
              {p.provider_id}: {p.capabilities.join(', ')}
            </div>
          ))}
        </div>
      )}

      {summary && <div className="people-view__summary">{summary}</div>}

      {results.length > 0 && (
        <div className="people-view__results">
          <h3>Recent Results ({results.length})</h3>
          <ul>
            {results.map((r, i) => (
              <li key={i}>
                <strong>{r.photo_id}</strong> — {r.provider_id} v{r.schema_version} —{' '}
                {JSON.stringify(r.result)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
