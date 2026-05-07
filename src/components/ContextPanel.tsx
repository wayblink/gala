import { selectedPhoto } from '../data/mockLibrary'
import type { DesktopEnvironment } from '../desktop/environment'

type ContextPanelProps = {
  desktopEnvironment: DesktopEnvironment
}

export function ContextPanel({ desktopEnvironment }: ContextPanelProps) {
  return (
    <aside className="context-panel" aria-label="View context">
      <section>
        <p className="eyebrow">View Context</p>
        <h2>Timeline</h2>
        <p className="mono-muted">Built-in strategy</p>
      </section>
      <section>
        <p className="eyebrow">Why Visible</p>
        <p>
          Photos are grouped by captured date. Items without capture dates use import time and remain marked in the grid.
        </p>
      </section>
      <section>
        <p className="eyebrow">Source Safety</p>
        <ul className="safety-list">
          <li className="is-online">3 sources online</li>
          <li>1 source offline</li>
          <li className="is-missing">1 missing source</li>
        </ul>
      </section>
      <section>
        <p className="eyebrow">Desktop Runtime</p>
        <p className="mono-muted">
          {desktopEnvironment.runtime} · {desktopEnvironment.platform} · {desktopEnvironment.engine}
        </p>
      </section>
      <section>
        <p className="eyebrow">Selected Photo</p>
        <h3>{selectedPhoto.fileName}</h3>
        <p className="mono-muted">May 7, 2026 · {selectedPhoto.camera}</p>
        <dl className="metadata-list">
          <div>
            <dt>Source</dt>
            <dd>{selectedPhoto.sourceName}</dd>
          </div>
          <div>
            <dt>Lens</dt>
            <dd>{selectedPhoto.lens}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{selectedPhoto.dimensions}</dd>
          </div>
        </dl>
      </section>
      <div className="context-panel__actions">
        <button className="primary-button">Save View</button>
        <button className="secondary-button">Explain</button>
      </div>
    </aside>
  )
}
