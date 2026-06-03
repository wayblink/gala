import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComingSoonView } from '../ComingSoonView'

describe('ComingSoonView', () => {
  it('renders title and blurb for Reorganize', () => {
    render(<ComingSoonView viewId="reorganize" title="Reorganize" />)

    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Reorganize' })).toBeInTheDocument()
    expect(screen.getByText('Rebuild a physical folder tree from custom rules.')).toBeInTheDocument()
  })

  it('describes Explore discovery', () => {
    render(<ComingSoonView viewId="explore" title="Explore" />)

    expect(
      screen.getByText('A place to discover connections between your photos.', { exact: false }),
    ).toBeInTheDocument()
  })
})
