import { useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  analysisRequest,
  capabilitiesList,
  facesList,
  facesSummary,
} from '../../desktop/capability'
import type {
  CapabilityDescriptor,
  Face,
  FaceSummary,
} from '../../desktop/capability'

export function PeopleView() {
  const [providers, setProviders] = useState<CapabilityDescriptor[]>([])
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [faces, setFaces] = useState<Face[]>([])
  const [stats, setStats] = useState<FaceSummary>({
    total_faces: 0,
    photos_with_faces: 0,
    unassigned_faces: 0,
  })

  const refreshFaces = async () => {
    try {
      const [next, summary] = await Promise.all([facesList(60), facesSummary()])
      setFaces(next)
      setStats(summary)
    } catch (err) {
      console.error('Failed to refresh faces:', err)
    }
  }

  useEffect(() => {
    void capabilitiesList().then(setProviders)
    void refreshFaces()
  }, [])

  const handleRunDetection = async () => {
    setRunning(true)
    setSummary(null)
    try {
      const run = await analysisRequest({
        capability: 'face.detect',
        scope_kind: 'all',
        priority: 0,
        force: false,
      })
      setSummary(
        `Job ${run.job_id.slice(0, 8)}… ${run.outcome} · ` +
          `${run.photos_done} done, ${run.photos_failed} failed, ${run.photos_skipped} skipped`,
      )
      await refreshFaces()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  const visionProvider = providers.find((p) => p.provider_id.startsWith('macos.vision'))

  return (
    <div className="people-view">
      <div className="people-view__header">
        <div>
          <h2>People</h2>
          <p className="people-view__subtitle">
            {visionProvider
              ? `Powered by ${visionProvider.provider_id} (macOS Vision Neural Engine)`
              : 'No face provider registered'}
          </p>
        </div>
        <div className="people-view__actions">
          <button onClick={handleRunDetection} disabled={running}>
            {running ? 'Detecting…' : 'Run face detection'}
          </button>
          <button onClick={() => void refreshFaces()}>Refresh</button>
        </div>
      </div>

      <div className="people-view__stats">
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.total_faces}</span>
          <span className="people-view__stat-label">faces</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.photos_with_faces}</span>
          <span className="people-view__stat-label">photos</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.unassigned_faces}</span>
          <span className="people-view__stat-label">unassigned</span>
        </div>
      </div>

      {summary && <div className="people-view__summary">{summary}</div>}

      {faces.length === 0 ? (
        <div className="people-view__empty">
          <p>
            No faces detected yet. Add a photo source via the left rail, scan it, and
            click <strong>Run face detection</strong>.
          </p>
        </div>
      ) : (
        <div className="people-view__grid">
          {faces.map((face) => (
            <FaceTile key={face.id} face={face} />
          ))}
        </div>
      )}
    </div>
  )
}

function FaceTile({ face }: { face: Face }) {
  const src = face.thumbnail_path ? convertFileSrc(face.thumbnail_path) : null
  // bbox values are 0..1 normalized, upper-left origin (orchestrator
  // convention). Use them to position an outline rectangle over the
  // thumbnail so each tile literally shows where the face was found.
  const overlayStyle: React.CSSProperties = {
    left: `${face.bbox_x * 100}%`,
    top: `${face.bbox_y * 100}%`,
    width: `${face.bbox_w * 100}%`,
    height: `${face.bbox_h * 100}%`,
  }
  return (
    <figure className="face-tile" title={face.file_name ?? face.photo_id}>
      <div className="face-tile__photo">
        {src ? <img src={src} alt={face.file_name ?? face.photo_id} /> : <span className="face-tile__placeholder" />}
        <span className="face-tile__bbox" style={overlayStyle} />
      </div>
      <figcaption className="face-tile__caption">
        <span className="face-tile__name">{face.file_name ?? face.photo_id}</span>
        <span className="face-tile__conf">{Math.round(face.confidence * 100)}%</span>
      </figcaption>
    </figure>
  )
}
