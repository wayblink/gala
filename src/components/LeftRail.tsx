import { exploreItems, libraryItems, sources, viewItems } from '../data/mockLibrary'
import { StatusDot } from './StatusDot'

function NavGroup({ title, items }: { title: string; items: typeof libraryItems }) {
  return (
    <section className="rail-group">
      <h2>{title}</h2>
      <div className="rail-list">
        {items.map((item) => (
          <a className={`rail-item${item.active ? ' rail-item--active' : ''}`} href="#" key={item.label}>
            <span>{item.label}</span>
            {item.count ? <span className="rail-item__count">{item.count}</span> : null}
          </a>
        ))}
      </div>
    </section>
  )
}

export function LeftRail() {
  return (
    <aside className="left-rail" aria-label="Photo navigation">
      <NavGroup title="Library" items={libraryItems} />
      <NavGroup title="Views" items={viewItems} />
      <section className="rail-group">
        <h2>Sources</h2>
        <div className="rail-list">
          {sources.map((source) => (
            <a className={`rail-item rail-item--source rail-item--${source.status}`} href="#" key={source.name}>
              <StatusDot status={source.status} />
              <span>{source.name}</span>
            </a>
          ))}
        </div>
      </section>
      <NavGroup title="Explore" items={exploreItems} />
      <section className="scan-card" aria-label="Scan status">
        <span>Scan Status</span>
        <div className="scan-card__bar">
          <span />
        </div>
        <strong>8,912 indexed</strong>
      </section>
    </aside>
  )
}
