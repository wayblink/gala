import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsView } from './SettingsView'
import { APPEARANCE_THEMES } from '../../types/appearance'
import { LANGUAGE_OPTIONS } from '../../types/locale'

describe('SettingsView', () => {
  it('renders appearance themes and reports selection changes', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    const onLanguageChange = vi.fn()

    render(
      <SettingsView
        themes={APPEARANCE_THEMES}
        activeThemeId="archive"
        onThemeChange={onThemeChange}
        languages={LANGUAGE_OPTIONS}
        activeLanguageId="en"
        onLanguageChange={onLanguageChange}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Color style' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Display language' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Archive Amber/i })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: /Midnight Blue/i }))

    expect(onThemeChange).toHaveBeenCalledWith('midnight')

    await user.click(screen.getByRole('radio', { name: /简体中文/i }))
    expect(onLanguageChange).toHaveBeenCalledWith('zh-Hans')
  })
})
