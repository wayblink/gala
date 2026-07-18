import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SourcesView } from './SourcesView'
import { I18nProvider, useLocaleState } from '../../state/useLocale'
import type { LibrarySource } from '../../types/library'

const sources: LibrarySource[] = [
  {
    id: 'source-1',
    name: 'Pictures',
    rootPath: '/Users/me/Pictures',
    status: 'online',
    photoCount: 42,
  },
]

function renderWithLocale(ui: React.ReactNode) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    const locale = useLocaleState()
    return <I18nProvider value={locale}>{children}</I18nProvider>
  }

  return render(ui, { wrapper: Wrapper })
}

describe('SourcesView', () => {
  it('saves an inline edited source name', async () => {
    const user = userEvent.setup()
    const onRenameSource = vi.fn().mockResolvedValue(undefined)

    renderWithLocale(
      <SourcesView
        sources={sources}
        editingSourceId="source-1"
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={onRenameSource}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
      />,
    )

    const input = screen.getByLabelText('Source name')
    await user.clear(input)
    await user.type(input, 'Travel Archive')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onRenameSource).toHaveBeenCalledWith('source-1', 'Travel Archive')
  })

  it('shows feedback and active source scan progress', () => {
    renderWithLocale(
      <SourcesView
        sources={sources}
        scanProgress={{
          status: 'thumbnailing',
          rootPath: '/Users/me/Pictures',
          sourceId: 'source-1',
          discoveredCount: 20,
          indexedCount: 20,
          thumbnailReadyCount: 7,
          thumbnailFailedCount: 2,
          skippedCount: 1,
          currentFile: 'IMG_0009.jpg',
          errorMessage: null,
        }}
        isScanning
        activeSourceActionId="source-1"
        feedbackMessage="Source rescanned."
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
      />,
    )

    const scanPanel = screen.getByLabelText('Scanning in progress')
    expect(screen.getByRole('status')).toHaveTextContent('Source rescanned.')
    expect(scanPanel).toBeInTheDocument()
    expect(within(scanPanel).getByRole('heading', { level: 2, name: 'Pictures' })).toBeInTheDocument()
    expect(within(scanPanel).getByText('9 / 20 processed')).toBeInTheDocument()
    expect(within(scanPanel).getByText('Current file: IMG_0009.jpg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rescanning…' })).toBeDisabled()
  })
})