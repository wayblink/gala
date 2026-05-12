import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the default Index Light Table shell', async () => {
    render(<App />)

    expect(screen.getByText('Memory Table')).toBeInTheDocument()
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
    expect(screen.getByText('Library Index')).toBeInTheDocument()
    expect(screen.getByText('No sources')).toBeInTheDocument()
    expect(screen.getByText('No photo selected')).toBeInTheDocument()
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
    expect(screen.getByText(/review candidate groups/i)).toBeInTheDocument()
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
  })

  it('routes unimplemented Views nav items to the ComingSoon placeholder', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Places' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Places' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0)
  })
})
