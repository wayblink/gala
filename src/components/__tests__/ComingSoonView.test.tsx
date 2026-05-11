import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComingSoonView } from '../ComingSoonView'

describe('ComingSoonView', () => {
  it('renders title and blurb for a V1 view like Places', () => {
    render(<ComingSoonView viewId="places" title="Places" />)

    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Places' })).toBeInTheDocument()
    expect(
      screen.getByText('Photos organized by where they were captured.'),
    ).toBeInTheDocument()
  })

  it('describes Memories with its explanation promise', () => {
    render(<ComingSoonView viewId="memories" title="Memories" />)

    expect(
      screen.getByText('Every Memory will explain itself before it appears.', { exact: false }),
    ).toBeInTheDocument()
  })
})
