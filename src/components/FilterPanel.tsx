import { useMemo, useState, type ReactNode } from 'react'
import type { FilterOptions, SmartFilter } from '../types/photos'

type FilterPanelProps = {
  filterOptions: FilterOptions
  smartFilter: SmartFilter
  onSmartFilterChange: (filter: SmartFilter) => void
  onClose: () => void
}

const FORMAT_LABELS: Record<string, string> = { raw: 'RAW', jpeg: 'JPEG', heif: 'HEIF', other: '其他' }
const DATE_PRESETS: Array<{ id: 'thisYear' | 'lastYear' | 'last30Days'; label: string }> = [
  { id: 'thisYear', label: '今年' },
  { id: 'lastYear', label: '去年' },
  { id: 'last30Days', label: '近 30 天' },
]

function presetRange(id: 'thisYear' | 'lastYear' | 'last30Days'): { from: string; to: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (id === 'thisYear') return { from: `${now.getFullYear()}-01-01`, to: iso(now) }
  if (id === 'lastYear') return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` }
  const from = new Date(now)
  from.setDate(from.getDate() - 30)
  return { from: iso(from), to: iso(now) }
}

function Section({ id, title, open, onToggle, children }: { id: string; title: string; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  return (
    <section className="filter-panel__section">
      <button type="button" className="filter-panel__section-header" aria-expanded={open} onClick={() => onToggle(id)}>
        <span>{title}</span>
        <span className="filter-panel__chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="filter-panel__section-body">{children}</div>}
    </section>
  )
}

export function FilterPanel({
  filterOptions,
  smartFilter,
  onSmartFilterChange,
  onClose,
}: FilterPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    date: true,
    state: true,
    camera: true,
    lens: true,
    source: true,
    tag: true,
  })
  const toggleSection = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  const isOpen = (key: string) => !collapsed[key]

  const toggleIn = (key: 'cameras' | 'lenses' | 'sources' | 'tags' | 'formatKinds', value: string) => {
    const arr = (smartFilter[key] as string[] | undefined) ?? []
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
    onSmartFilterChange({ ...smartFilter, [key]: next.length ? next : undefined })
  }

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = []
    for (const k of smartFilter.formatKinds ?? []) chips.push({ key: `fmt-${k}`, label: FORMAT_LABELS[k] ?? k, clear: () => toggleIn('formatKinds', k) })
    for (const c of smartFilter.cameras ?? []) chips.push({ key: `cam-${c}`, label: c, clear: () => toggleIn('cameras', c) })
    for (const l of smartFilter.lenses ?? []) chips.push({ key: `lens-${l}`, label: l, clear: () => toggleIn('lenses', l) })
    for (const s of smartFilter.sources ?? []) chips.push({ key: `src-${s}`, label: s, clear: () => toggleIn('sources', s) })
    for (const t of smartFilter.tags ?? []) chips.push({ key: `tag-${t}`, label: `#${t}`, clear: () => toggleIn('tags', t) })
    if (smartFilter.dateFrom) chips.push({ key: 'df', label: `从 ${smartFilter.dateFrom}`, clear: () => onSmartFilterChange({ ...smartFilter, dateFrom: undefined }) })
    if (smartFilter.dateTo) chips.push({ key: 'dt', label: `到 ${smartFilter.dateTo}`, clear: () => onSmartFilterChange({ ...smartFilter, dateTo: undefined }) })
    if (smartFilter.favorites !== undefined) chips.push({ key: 'fav', label: smartFilter.favorites ? '收藏' : '未收藏', clear: () => onSmartFilterChange({ ...smartFilter, favorites: undefined }) })
    if (smartFilter.hidden !== undefined) chips.push({ key: 'hid', label: smartFilter.hidden ? '隐藏' : '可见', clear: () => onSmartFilterChange({ ...smartFilter, hidden: undefined }) })
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartFilter])

  const hasActive = activeChips.length > 0

  return (
    <div className="filter-panel">
      <div className="filter-panel__header">
        <h3>过滤</h3>
        <div className="filter-panel__header-actions">
          {hasActive && (
            <button type="button" className="filter-panel__clear" onClick={() => onSmartFilterChange({})}>清空</button>
          )}
          <button type="button" className="filter-panel__close" onClick={onClose} aria-label="关闭过滤">✕</button>
        </div>
      </div>

      {hasActive && (
        <div className="filter-panel__active">
          {activeChips.map((chip) => (
            <button key={chip.key} type="button" className="filter-active-chip" onClick={chip.clear}>
              {chip.label}<span aria-hidden="true"> ✕</span>
            </button>
          ))}
        </div>
      )}

      <Section id="format" title="格式" open={isOpen('format')} onToggle={toggleSection}>
        <div className="filter-panel__chips">
          {(filterOptions.formatKinds ?? ['raw', 'jpeg', 'heif', 'other']).map((k) => (
            <label key={k} className={`filter-chip${smartFilter.formatKinds?.includes(k) ? ' on' : ''}`}>
              <input type="checkbox" checked={smartFilter.formatKinds?.includes(k) ?? false} onChange={() => toggleIn('formatKinds', k)} />
              {FORMAT_LABELS[k] ?? k}
            </label>
          ))}
        </div>
      </Section>

      <Section id="date" title="时间" open={isOpen('date')} onToggle={toggleSection}>
        <div className="filter-presets">
          {DATE_PRESETS.map((p) => (
            <button key={p.id} type="button" className="filter-preset" onClick={() => { const r = presetRange(p.id); onSmartFilterChange({ ...smartFilter, dateFrom: r.from, dateTo: r.to }) }}>{p.label}</button>
          ))}
        </div>
        <div className="filter-panel__date-row">
          <label>从<input className="filter-date-input" type="date" value={smartFilter.dateFrom ?? ''} onChange={(e) => onSmartFilterChange({ ...smartFilter, dateFrom: e.target.value || undefined })} /></label>
          <label>到<input className="filter-date-input" type="date" value={smartFilter.dateTo ?? ''} onChange={(e) => onSmartFilterChange({ ...smartFilter, dateTo: e.target.value || undefined })} /></label>
        </div>
      </Section>

      <Section id="state" title="收藏与隐藏" open={isOpen('state')} onToggle={toggleSection}>
        <div className="filter-panel__chips">
          <label className={`filter-chip${smartFilter.favorites === true ? ' on' : ''}`}>
            <input type="checkbox" checked={smartFilter.favorites === true} onChange={(e) => onSmartFilterChange({ ...smartFilter, favorites: e.target.checked ? true : undefined })} />收藏
          </label>
          <label className={`filter-chip${smartFilter.favorites === false ? ' on' : ''}`}>
            <input type="checkbox" checked={smartFilter.favorites === false} onChange={(e) => onSmartFilterChange({ ...smartFilter, favorites: e.target.checked ? false : undefined })} />未收藏
          </label>
          <label className={`filter-chip${smartFilter.hidden === true ? ' on' : ''}`}>
            <input type="checkbox" checked={smartFilter.hidden === true} onChange={(e) => onSmartFilterChange({ ...smartFilter, hidden: e.target.checked ? true : undefined })} />隐藏
          </label>
        </div>
      </Section>

      <Section id="camera" title="相机" open={isOpen('camera')} onToggle={toggleSection}>
        {filterOptions.cameras.length > 0 ? (
          <div className="filter-panel__chips">
            {filterOptions.cameras.map((c) => (
              <label key={c} className={`filter-chip${smartFilter.cameras?.includes(c) ? ' on' : ''}`}>
                <input type="checkbox" checked={smartFilter.cameras?.includes(c) ?? false} onChange={() => toggleIn('cameras', c)} />{c}
              </label>
            ))}
          </div>
        ) : (
          <p className="filter-panel__empty">暂无</p>
        )}
      </Section>

      <Section id="lens" title="镜头" open={isOpen('lens')} onToggle={toggleSection}>
        {(filterOptions.lenses?.length ?? 0) > 0 ? (
          <div className="filter-panel__chips">
            {filterOptions.lenses!.map((l) => (
              <label key={l} className={`filter-chip${smartFilter.lenses?.includes(l) ? ' on' : ''}`}>
                <input type="checkbox" checked={smartFilter.lenses?.includes(l) ?? false} onChange={() => toggleIn('lenses', l)} />{l}
              </label>
            ))}
          </div>
        ) : (
          <p className="filter-panel__empty">暂无</p>
        )}
      </Section>

      <Section id="source" title="来源" open={isOpen('source')} onToggle={toggleSection}>
        {(filterOptions.sources?.length ?? 0) > 0 ? (
          <div className="filter-panel__chips">
            {filterOptions.sources!.map((s) => (
              <label key={s} className={`filter-chip${smartFilter.sources?.includes(s) ? ' on' : ''}`}>
                <input type="checkbox" checked={smartFilter.sources?.includes(s) ?? false} onChange={() => toggleIn('sources', s)} />{s}
              </label>
            ))}
          </div>
        ) : (
          <p className="filter-panel__empty">暂无</p>
        )}
      </Section>

      <Section id="tag" title="标签" open={isOpen('tag')} onToggle={toggleSection}>
        {(filterOptions.tags?.length ?? 0) > 0 ? (
          <div className="filter-panel__chips">
            {filterOptions.tags!.map((tg) => (
              <label key={tg} className={`filter-chip${smartFilter.tags?.includes(tg) ? ' on' : ''}`}>
                <input type="checkbox" checked={smartFilter.tags?.includes(tg) ?? false} onChange={() => toggleIn('tags', tg)} />{tg}
              </label>
            ))}
          </div>
        ) : (
          <p className="filter-panel__empty">暂无</p>
        )}
      </Section>
    </div>
  )
}
