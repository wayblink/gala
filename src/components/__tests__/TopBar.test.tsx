import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from '../TopBar'

const librarySummary = {
  sources: [],
  totalPhotos: 0,
  recentlyAddedCount: 0,
  favoritesCount: 0,
}

describe('TopBar', () => {
  it('reports search query changes from the search field', () => {
    const onSearchChange = vi.fn()

    render(
      <TopBar
        onAddFolder={() => undefined}
        isScanning={false}
        librarySummary={librarySummary}
        searchQuery=""
        onSearchChange={onSearchChange}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search photos' }), {
      target: { value: 'Kyoto' },
    })

    expect(onSearchChange).toHaveBeenCalledWith('Kyoto')
  })
})
