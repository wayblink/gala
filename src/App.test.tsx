import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

  it('opens Sources as a management surface from the source header', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))

    const sourcesView = await screen.findByLabelText('Sources')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sources' })).toBeInTheDocument()
    expect(screen.getByText('Indexed Sources')).toBeInTheDocument()
    expect(within(sourcesView).getByRole('button', { name: /Add source/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()
  })

  it('routes the left-rail add source action into the Sources management surface', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sources' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your first source/i })).toBeInTheDocument()
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
    expect(await screen.findByText('No photos found in this view.')).toBeInTheDocument()
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
    expect(screen.getByText(/0 groups · 0 decided/i)).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Scan Quality' })).toBeInTheDocument()
    expect(screen.getByText(/No background tasks yet/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('View context')).not.toBeInTheDocument()
  })
  it('opens Settings as a real appearance page from the utility bar', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Color style' })).toBeInTheDocument()
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
