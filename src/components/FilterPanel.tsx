import type { FilterOptions, SmartFilter } from '../types/photos'

type FilterPanelProps = {
  filterOptions: FilterOptions
  smartFilter: SmartFilter
  onSmartFilterChange: (filter: SmartFilter) => void
  onClose: () => void
}

export function FilterPanel({
  filterOptions,
  smartFilter,
  onSmartFilterChange,
  onClose,
}: FilterPanelProps) {
  const toggleCamera = (camera: string) => {
    const cameras = smartFilter.cameras ?? []
    const next = cameras.includes(camera)
      ? cameras.filter((c) => c !== camera)
      : [...cameras, camera]
    onSmartFilterChange({ ...smartFilter, cameras: next.length ? next : undefined })
  }

  const toggleExtension = (ext: string) => {
    const extensions = smartFilter.extensions ?? []
    const next = extensions.includes(ext)
      ? extensions.filter((e) => e !== ext)
      : [...extensions, ext]
    onSmartFilterChange({ ...smartFilter, extensions: next.length ? next : undefined })
  }

  const hasAnyFilter =
    (smartFilter.cameras?.length ?? 0) > 0 ||
    (smartFilter.extensions?.length ?? 0) > 0 ||
    !!smartFilter.dateFrom ||
    !!smartFilter.dateTo

  return (
    <div className="filter-panel">
      <div className="filter-panel__header">
        <h3>Filters</h3>
        <div className="filter-panel__header-actions">
          {hasAnyFilter && (
            <button
              className="filter-panel__clear"
              type="button"
              onClick={() => onSmartFilterChange({})}
            >
              Clear all
            </button>
          )}
          <button className="filter-panel__close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {filterOptions.cameras.length > 0 && (
        <div className="filter-panel__section">
          <h4>Camera</h4>
          <div className="filter-panel__chips">
            {filterOptions.cameras.map((camera) => (
              <label className="filter-chip" key={camera}>
                <input
                  checked={smartFilter.cameras?.includes(camera) ?? false}
                  type="checkbox"
                  onChange={() => toggleCamera(camera)}
                />
                {camera}
              </label>
            ))}
          </div>
        </div>
      )}

      {filterOptions.extensions.length > 0 && (
        <div className="filter-panel__section">
          <h4>File Type</h4>
          <div className="filter-panel__chips">
            {filterOptions.extensions.map((ext) => (
              <label className="filter-chip" key={ext}>
                <input
                  checked={smartFilter.extensions?.includes(ext) ?? false}
                  type="checkbox"
                  onChange={() => toggleExtension(ext)}
                />
                {ext.toUpperCase()}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="filter-panel__section">
        <h4>Date Range</h4>
        <div className="filter-panel__date-row">
          <label>
            From
            <input
              className="filter-date-input"
              type="date"
              value={smartFilter.dateFrom ?? ''}
              onChange={(e) =>
                onSmartFilterChange({ ...smartFilter, dateFrom: e.target.value || undefined })
              }
            />
          </label>
          <label>
            To
            <input
              className="filter-date-input"
              type="date"
              value={smartFilter.dateTo ?? ''}
              onChange={(e) =>
                onSmartFilterChange({ ...smartFilter, dateTo: e.target.value || undefined })
              }
            />
          </label>
        </div>
      </div>
    </div>
  )
}
