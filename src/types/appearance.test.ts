import { describe, expect, it } from 'vitest'
import { APPEARANCE_THEMES } from './appearance'

describe('appearance theme semantics', () => {
  it('defines contrasting functional colors for every theme', () => {
    for (const theme of APPEARANCE_THEMES) {
      expect(Object.keys(theme.colors)).toEqual([
        'primary',
        'info',
        'success',
        'warning',
        'danger',
        'onPrimary',
      ])

      const functionalColors = [
        theme.colors.primary,
        theme.colors.info,
        theme.colors.success,
        theme.colors.warning,
        theme.colors.danger,
      ]

      expect(new Set(functionalColors).size, theme.id).toBe(5)
      expect(functionalColors.every((color) => /^#[0-9a-f]{6}$/i.test(color)), theme.id).toBe(true)
    }
  })

  it('keeps the persisted theme identifiers stable', () => {
    expect(APPEARANCE_THEMES.map((theme) => theme.id)).toEqual([
      'archive',
      'graphite',
      'midnight',
      'sage',
      'paper',
      'glacier',
      'mint',
      'coral',
      'cyan',
    ])
  })
})
