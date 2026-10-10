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
    const onPhotoQualityChange = vi.fn()

    render(
      <SettingsView
        themes={APPEARANCE_THEMES}
        activeThemeId="light"
        onThemeChange={onThemeChange}
        languages={LANGUAGE_OPTIONS}
        activeLanguageId="en"
        onLanguageChange={onLanguageChange}
        photoQualityEnabled={false}
        onPhotoQualityChange={onPhotoQualityChange}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Color style' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Display language' })).toBeInTheDocument()
    const qualitySwitch = screen.getByRole('switch', { name: 'Off' })
    expect(qualitySwitch).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: /^Light/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /^Dark/i })).toBeInTheDocument()
    expect(document.querySelectorAll('.theme-card__preview')).toHaveLength(APPEARANCE_THEMES.length)
    expect(document.querySelectorAll('.theme-card__preview-color')).toHaveLength(APPEARANCE_THEMES.length * 5)

    await user.click(screen.getByRole('radio', { name: /^Dark/i }))

    expect(onThemeChange).toHaveBeenCalledWith('dark')

    await user.click(screen.getByRole('radio', { name: /简体中文/i }))
    expect(onLanguageChange).toHaveBeenCalledWith('zh-Hans')

    await user.click(qualitySwitch)
    expect(onPhotoQualityChange).toHaveBeenCalledWith(true)
  })
})
