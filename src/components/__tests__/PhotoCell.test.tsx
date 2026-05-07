import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhotoCell } from '../PhotoCell'
import { photos } from '../../data/mockLibrary'

describe('PhotoCell', () => {
  it('marks selected cells accessibly', () => {
    render(<PhotoCell photo={photos[0]} selected />)

    expect(screen.getByRole('button', { name: /selected photo dscf4281/i })).toBeInTheDocument()
  })

  it('shows missing and offline status labels', () => {
    render(<PhotoCell photo={photos[2]} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()

    render(<PhotoCell photo={photos[3]} />)
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })
})
