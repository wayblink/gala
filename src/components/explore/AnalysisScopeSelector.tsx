import { useEffect } from 'react'
import { ThemedSelect } from '../ThemedSelect'
import { useI18n } from '../../state/useLocale'
import type { AnalysisScope } from '../../types/analysisScope'
import { ensureScopeAvailable } from '../../types/analysisScope'
import type { LibrarySource } from '../../types/library'

type AnalysisScopeSelectorProps = {
  value: AnalysisScope
  sources?: LibrarySource[]
  onChange: (scope: AnalysisScope) => void
  disabled?: boolean
}

export function AnalysisScopeSelector({ value, sources = [], onChange, disabled = false }: AnalysisScopeSelectorProps) {
  const { t } = useI18n()
  useEffect(() => {
    const next = ensureScopeAvailable(value, sources)
    if (next.kind !== value.kind || (next.kind === 'source' && value.kind === 'source' && next.sourceId !== value.sourceId)) {
      onChange(next)
    }
  }, [onChange, sources, value])

  const selectValue = value.kind === 'source' ? `source:${value.sourceId}` : 'all'
  const options = [
    { value: 'all', label: t('scope.allLibrary') },
    ...sources.map((source) => ({
      value: `source:${source.id}`,
      label: `${source.name} · ${source.photoCount.toLocaleString()} photos`,
    })),
  ]

  return (
    <label className="analysis-scope" aria-label="Processing scope">
      <span>{t('scope.label')}</span>
      <ThemedSelect
        value={selectValue}
        options={options}
        disabled={disabled}
        ariaLabel={t('scope.label')}
        onChange={(next) => {
          if (next === 'all') {
            onChange({ kind: 'all' })
            return
          }
          const sourceId = next.replace(/^source:/, '')
          const source = sources.find((item) => item.id === sourceId)
          if (source) onChange({ kind: 'source', sourceId: source.id, sourceName: source.name })
        }}
      />
    </label>
  )
}
