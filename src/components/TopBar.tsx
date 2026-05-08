import { Filter, FolderPlus, Grid3X3, Search } from 'lucide-react'
import type { LibrarySummary } from '../types/library'

type TopBarProps = {
  onAddFolder: () => void
  isScanning: boolean
  librarySummary: LibrarySummary
  searchQuery: string
  onSearchChange: (query: string) => void
  viewTitle?: string
}

const formatCount = (count: number) => new Intl.NumberFormat().format(count)

export function TopBar({
  onAddFolder,
  isScanning,
  librarySummary,
  searchQuery,
  onSearchChange,
  viewTitle = 'Timeline: All Photos',
}: TopBarProps) {
  const onlineSources = librarySummary.sources.filter((source) => source.status === 'online').length
  const sourceLabel = `${librarySummary.sources.length} source${librarySummary.sources.length === 1 ? '' : 's'}`

  return (
    <header className="top-bar">
      <div className="top-bar__brand">Memory Table</div>
      <div className="top-bar__view">
        <h1>{viewTitle}</h1>
        <p>
          {formatCount(librarySummary.totalPhotos)} photos · {sourceLabel} · {onlineSources} online
        </p>
      </div>
      <div className="top-bar__actions">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search photos</span>
          <input
            placeholder="Search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <button className="icon-button" aria-label="Change density">
          <Grid3X3 size={16} />
        </button>
        <button className="icon-button" aria-label="Open filters">
          <Filter size={16} />
        </button>
        <button className="primary-button" onClick={onAddFolder} disabled={isScanning}>
          <FolderPlus size={16} />
          {isScanning ? 'Scanning...' : 'Add Folder'}
        </button>
      </div>
    </header>
  )
}
