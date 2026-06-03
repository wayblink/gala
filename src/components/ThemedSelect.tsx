import { useEffect, useId, useRef, useState } from 'react'

export type ThemedSelectOption = {
  value: string
  label: string
}

type ThemedSelectProps = {
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export function ThemedSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className = '',
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const active = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const moveBy = (delta: number) => {
    if (options.length === 0) return
    const current = Math.max(0, options.findIndex((option) => option.value === value))
    const next = Math.min(options.length - 1, Math.max(0, current + delta))
    onChange(options[next].value)
  }

  return (
    <div className={`themed-select ${className}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="themed-select__button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) setOpen(true)
            else moveBy(1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) setOpen(true)
            else moveBy(-1)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        <span className="themed-select__value">{active?.label ?? ''}</span>
        <span className="themed-select__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && !disabled ? (
        <div className="themed-select__popover" role="listbox" id={listboxId} aria-label={ariaLabel}>
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`themed-select__option${selected ? ' themed-select__option--selected' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  buttonRef.current?.focus()
                }}
              >
                <span className="themed-select__check" aria-hidden="true">{selected ? '✓' : ''}</span>
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
