import { Filter, Grid3X3, Plus, Search } from 'lucide-react'

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">Memory Table</div>
      <div className="top-bar__view">
        <h1>Timeline: All Photos</h1>
        <p>18,426 photos · 2009-2026 · 3 sources online</p>
      </div>
      <div className="top-bar__actions">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search photos</span>
          <input placeholder="Search" />
        </label>
        <button className="icon-button" aria-label="Change density">
          <Grid3X3 size={16} />
        </button>
        <button className="icon-button" aria-label="Open filters">
          <Filter size={16} />
        </button>
        <button className="primary-button">
          <Plus size={16} />
          Add Source
        </button>
      </div>
    </header>
  )
}
