import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from '../TopBar'

describe('TopBar', () => {
  it('reports search query changes from the search field', () => {
    const onSearchChange = vi.fn()
    const onDisplayModeChange = vi.fn()

    render(
      <TopBar
        onAddFolder={() => undefined}
        isScanning={false}
        searchQuery=""
        onSearchChange={onSearchChange}
        displayMode="thumbnail"
        onDisplayModeChange={onDisplayModeChange}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search photos' }), {
      target: { value: 'Kyoto' },
    })

    expect(onSearchChange).toHaveBeenCalledWith('Kyoto')
  })

  it('reports display mode changes from the mode switcher', () => {
    const onDisplayModeChange = vi.fn()

    render(
      <TopBar
        onAddFolder={() => undefined}
        isScanning={false}
        searchQuery=""
        onSearchChange={() => undefined}
        displayMode="thumbnail"
        onDisplayModeChange={onDisplayModeChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(onDisplayModeChange).toHaveBeenCalledWith('list')
  })
})
