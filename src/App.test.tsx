import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the default Index Light Table shell', async () => {
    render(<App />)

    expect(screen.getByText('Memory Table')).toBeInTheDocument()
    expect(screen.getByText('Timeline: All Photos')).toBeInTheDocument()
    expect(screen.getByText('0 photos · 0 sources · 0 online')).toBeInTheDocument()
    expect(screen.getByText('View Context')).toBeInTheDocument()
    expect(screen.getByText('Library Index')).toBeInTheDocument()
    expect(await screen.findByText('Desktop Runtime')).toBeInTheDocument()
    expect(screen.getByText('No sources')).toBeInTheDocument()
    expect(screen.getByText('No photo selected')).toBeInTheDocument()
  })
})
