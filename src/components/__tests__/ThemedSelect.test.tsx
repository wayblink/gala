import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemedSelect } from '../ThemedSelect'

describe('ThemedSelect', () => {
  it('moves active focus without committing until Enter is pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ThemedSelect
        value="merged"
        ariaLabel="Variant display"
        options={[
          { value: 'merged', label: 'Merged' },
          { value: 'separate', label: 'Separate' },
        ]}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Variant display' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('listbox', { name: 'Variant display' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Merged' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('separate')
    expect(trigger).toHaveFocus()
  })

  it('supports Home, End, and Escape while the listbox is open', async () => {
    const user = userEvent.setup()
    render(
      <ThemedSelect
        value="merged"
        ariaLabel="Variant display"
        options={[
          { value: 'merged', label: 'Merged' },
          { value: 'separate', label: 'Separate' },
        ]}
        onChange={() => undefined}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Variant display' })
    await user.click(trigger)
    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'Separate' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('option', { name: 'Merged' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
