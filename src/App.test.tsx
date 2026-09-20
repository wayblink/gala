import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the default Index Light Table shell', async () => {
    render(<App />)

    expect(screen.getByText('Gala')).toBeInTheDocument()
    expect(document.querySelector('.top-bar__brand-mark')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thumbnail table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gallery' })).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Timeline photo surface')).queryByRole('heading', {
        name: 'All Photos',
        level: 2,
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Library Index')).not.toBeInTheDocument()
    expect(screen.getByText('No sources')).toBeInTheDocument()
    expect(screen.getByText('No photo selected')).toBeInTheDocument()
  })

  it('uses the hovered photo as the right-panel inspector target in selection mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Open / }).length).toBeGreaterThan(1)
    })
    const photoButtons = screen.getAllByRole('button', { name: /^Open / })
    expect(photoButtons.length).toBeGreaterThan(1)
    const secondPhotoName = photoButtons[1].getAttribute('aria-label')?.replace(/^Open /, '')
    expect(secondPhotoName).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Enter selection mode' }))
    await user.hover(photoButtons[1])

    expect(await within(screen.getByLabelText('View context')).findByText(secondPhotoName!)).toBeInTheDocument()
  })

  it('adds the current photo to an album in the web preview workflow', async () => {
    const user = userEvent.setup()
    render(<App />)

    const currentPhotoName = await within(screen.getByLabelText('View context')).findByText('ai_face_08.jpg')
    expect(currentPhotoName).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New album' }))
    await user.type(screen.getByPlaceholderText('Album name'), 'Review Picks')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('button', { name: 'Review Picks' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Add to Album' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Add to Album' })).getByRole('button', { name: 'Add to Review Picks' }))
    await user.click(screen.getByRole('button', { name: 'Review Picks' }))

    expect(await within(screen.getByLabelText('Timeline photo surface')).findByRole('button', { name: 'Open ai_face_08.jpg' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Timeline photo surface')).queryByRole('button', { name: 'Open ai_face_02.jpg' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '- Remove from Album' }))
    await user.click(screen.getByRole('button', { name: 'Remove from Review Picks' }))
    expect(await screen.findByText('No photos found in this view.')).toBeInTheDocument()
  })

  it('opens Sources as a management surface from the source header', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))

    const sourcesView = await screen.findByLabelText('Sources')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sources' })).toBeInTheDocument()
    expect(await within(sourcesView).findByRole('heading', { level: 3, name: 'test-photos' })).toBeInTheDocument()
    expect(within(sourcesView).getByRole('button', { name: /Add source/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()
  })

  it('deletes a source from the left rail with one confirmation and refreshes the UI', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    const localFoldersToggle = await screen.findByRole('button', { name: 'Expand Local Folders' })
    fireEvent.click(localFoldersToggle)
    const sourceButton = await screen.findByRole('button', { name: 'test-photos 25' })
    const sourceRow = sourceButton.closest('.rail-item--source-root')
    expect(sourceRow).not.toBeNull()
    fireEvent.click(within(sourceRow as HTMLElement).getByTitle('Remove source'))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('test-photos'))
    expect(await screen.findByRole('button', { name: 'All Photos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'test-photos 25' })).not.toBeInTheDocument()
  })

  it('routes the left-rail add source action into the Sources management surface', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))

    const sourcesView = await screen.findByLabelText('Sources')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sources' })).toBeInTheDocument()
    const addSourceButton = within(sourcesView).getByRole('button', { name: /Add source/i })
    fireEvent.click(addSourceButton)
    expect(screen.getAllByRole('button', { name: /Local Folder/ }).some((button) => button.classList.contains('source-type-option'))).toBe(true)
    expect(screen.getAllByRole('button', { name: /Apple Photos/ }).some((button) => button.classList.contains('source-type-option'))).toBe(true)
  })

  it('keeps view explanations out of navigation and context metadata', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /recently added/i }))

    expect(
      within(screen.getByLabelText('Timeline photo surface')).getByRole('heading', {
        name: 'Recently Added',
        level: 2,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Photos imported in the last 7 days, ordered by import time.')).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('View context')).queryByText('Why Visible')).not.toBeInTheDocument()
    expect(await screen.findByText('13 visible photos')).toBeInTheDocument()
  })

  it('switches between thumbnail, list, and gallery display modes', () => {
    render(<App />)

    const thumbnailButton = screen.getByRole('button', { name: 'Thumbnail table' })
    const listButton = screen.getByRole('button', { name: 'List' })
    const galleryButton = screen.getByRole('button', { name: 'Gallery' })

    expect(thumbnailButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(listButton)
    expect(listButton).toHaveAttribute('aria-pressed', 'true')
    expect(thumbnailButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(galleryButton)
    expect(galleryButton).toHaveAttribute('aria-pressed', 'true')
    expect(listButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows Similar Review as a workflow surface when selected', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Similar Review' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Similar Review' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/13 groups · 0 decided/i)).toBeInTheDocument()
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
  })


  it('keeps existing browse views on the timeline photo surface', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /favorites/i }))
    expect(
      within(screen.getByLabelText('Timeline photo surface')).getByRole('heading', {
        name: 'Favorites',
        level: 2,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Similar Review' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /hidden/i }))
    expect(
      within(screen.getByLabelText('Timeline photo surface')).getByRole('heading', {
        name: 'Hidden',
        level: 2,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Similar Review' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /all photos/i }))
    expect(screen.getByLabelText('Timeline photo surface')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Timeline photo surface')).queryByRole('heading', {
        name: 'All Photos',
        level: 2,
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Similar Review' })).not.toBeInTheDocument()
  })

  it('opens Reorganize from Arrange and Background Tasks from the utility bar', async () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Places' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Memories' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reorganize' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Reorganize' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan plan/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()

    // Background Tasks is no longer a Views tab; it lives in the bottom utility bar.
    fireEvent.click(screen.getByRole('button', { name: 'Background Tasks' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Background Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan Quality' })).toBeDisabled()
    expect(screen.getByText(/No background tasks yet/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()
  })
  it('opens Settings as a real appearance page from the utility bar', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Color style' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Off' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()
  })

  it('uses the right panel only for photo inspection and review inspectors', async () => {
    render(<App />)

    expect(screen.getByLabelText('View context')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'People' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Content' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Content Recognition' })).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Similar Review' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Similar Review' })).toBeInTheDocument()
    expect(screen.getByLabelText('View context')).toBeInTheDocument()
    expect(within(screen.getByLabelText('View context')).getByText(/No active group|Group Inspector/i)).toBeInTheDocument()
  })

})
