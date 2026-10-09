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
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const active = options.find((option) => option.value === value) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex)

  useEffect(() => {
    if (open) optionRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex, open])

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

  const openListbox = () => {
    setHighlightedIndex(selectedIndex)
    setOpen(true)
  }

  const moveBy = (delta: number) => {
    if (options.length === 0) return
    setHighlightedIndex((current) => Math.min(options.length - 1, Math.max(0, current + delta)))
  }

  const commit = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
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
        onClick={() => {
          if (open) setOpen(false)
          else openListbox()
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) openListbox()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) openListbox()
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (open) setOpen(false)
            else openListbox()
          }
        }}
      >
        <span className="themed-select__value">{active?.label ?? ''}</span>
        <span className="themed-select__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && !disabled ? (
        <div
          className="themed-select__popover"
          role="listbox"
          id={listboxId}
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveBy(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveBy(-1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setHighlightedIndex(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setHighlightedIndex(options.length - 1)
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              commit(highlightedIndex)
            }
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value
            return (
              <button
                ref={(element) => { optionRefs.current[index] = element }}
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`themed-select__option${selected ? ' themed-select__option--selected' : ''}`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commit(index)}
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
