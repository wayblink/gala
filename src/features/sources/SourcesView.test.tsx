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
        onOpenSourceFolder={() => undefined}
      />,
    )

    const input = screen.getByLabelText('Source name')
    await user.clear(input)
    await user.type(input, 'Travel Archive')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onRenameSource).toHaveBeenCalledWith('source-1', 'Travel Archive')
  })

  it('shows source previews and opens the folder from a path popover', async () => {
    const user = userEvent.setup()
    const onOpenSourceFolder = vi.fn().mockResolvedValue(undefined)

    renderWithLocale(
      <SourcesView
        sources={[{ ...sources[0], previewPaths: ['/thumb/one.jpg', '/thumb/two.jpg'] }]}
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={onOpenSourceFolder}
      />,
    )

    expect(screen.queryByText('Library')).not.toBeInTheDocument()
    expect(screen.queryByText('/Users/me/Pictures')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.source-card__preview img')).toHaveLength(2)
    expect(screen.getByText('Folder available')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show source location' }))
    const popover = screen.getByRole('dialog', { name: 'Source location' })
    expect(within(popover).getByText('/Users/me/Pictures')).toBeInTheDocument()
    await user.click(within(popover).getByRole('button', { name: 'Open in Finder' }))
    expect(onOpenSourceFolder).toHaveBeenCalledWith('/Users/me/Pictures')
  })

  it('uses Photos-specific status and hides filesystem-only actions', () => {
    renderWithLocale(
      <SourcesView
        sources={[{ ...sources[0], sourceKind: 'apple_photos', name: 'Apple Photos', rootPath: 'apple-photos://library' }]}
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
      />,
    )

    expect(screen.getByText('Photos access granted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show source location' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Relink path' })).not.toBeInTheDocument()
  })

  it('opens a source timeline from its card name', async () => {
    const user = userEvent.setup()
    const onSelectSource = vi.fn()
    renderWithLocale(
      <SourcesView
        sources={sources}
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
        onSelectSource={onSelectSource}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Pictures' }))
    expect(onSelectSource).toHaveBeenCalledWith('source-1')
  })

  it('offers Local Folder and Apple Photos inside Add source', async () => {
    const user = userEvent.setup()
    const onAddFolderSource = vi.fn()
    const onConnectApplePhotos = vi.fn()
    renderWithLocale(
      <SourcesView
        sources={sources}
        onAddFolderSource={onAddFolderSource}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
        onConnectApplePhotos={onConnectApplePhotos}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Connect Apple Photos' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Add source/i }))
    expect(screen.getByRole('dialog', { name: 'Add source' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Local Folder/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Apple Photos/ }))
    expect(onConnectApplePhotos).toHaveBeenCalledTimes(1)
  })

  it('does not offer a second Apple Photos connection after it is already connected', async () => {
    const user = userEvent.setup()
    const onConnectApplePhotos = vi.fn()
    renderWithLocale(
      <SourcesView
        sources={[{ ...sources[0], sourceKind: 'apple_photos', name: 'Apple Photos', rootPath: 'apple-photos://library' }]}
        onAddFolderSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
        onConnectApplePhotos={onConnectApplePhotos}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Add source/i }))
    const appleOption = screen.getAllByRole('button', { name: /Apple Photos/ })
      .find((button) => button.classList.contains('source-type-option'))
    expect(appleOption).toBeDefined()
    expect(appleOption).toBeDisabled()
    expect(screen.getByText(/Already connected/i)).toBeInTheDocument()
    expect(onConnectApplePhotos).not.toHaveBeenCalled()
  })

  it('uses Sync and Disconnect actions for Apple Photos', () => {
    renderWithLocale(
      <SourcesView
        sources={[{ ...sources[0], sourceKind: 'apple_photos', name: 'Apple Photos', rootPath: 'apple-photos://library' }]}
        onAddFolderSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: /Sync/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rescan/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument()
  })

  it('requests source deletion from the row action', async () => {
    const user = userEvent.setup()
    const onDeleteSource = vi.fn()

    renderWithLocale(
      <SourcesView
        sources={sources}
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={onDeleteSource}
        onOpenSourceFolder={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteSource).toHaveBeenCalledWith('source-1', 'Pictures')
  })

  it('disables destructive actions while a source operation is active', () => {
    renderWithLocale(
      <SourcesView
        sources={sources}
        activeSourceActionId="source-1"
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Relink path' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rescan' })).toBeDisabled()
    expect(screen.getByRole('main', { name: 'Sources' })).toHaveAttribute('aria-busy', 'true')
  })

  it('disables rescan and explains when a removable source is offline', () => {
    renderWithLocale(
      <SourcesView
        sources={[{ ...sources[0], rootPath: '/Volumes/Travel', status: 'offline' }]}
        onAddSource={() => undefined}
        onStartEditingSource={() => undefined}
        onCancelEditingSource={() => undefined}
        onRenameSource={() => undefined}
        onRelinkSource={() => undefined}
        onRescanSource={() => undefined}
        onDeleteSource={() => undefined}
        onOpenSourceFolder={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Rescan' })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('Source is offline')
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
        onOpenSourceFolder={() => undefined}
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
