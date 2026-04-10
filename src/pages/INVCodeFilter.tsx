import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Option {
  value: string
  label: string
}

interface Props {
  selected: string[]
  onChange: (selected: string[]) => void
  codeOptions?: Option[]          // scoped to current tab — passed from Inventory
  activeSortKey?: string | null
  activeSortDir?: 'asc' | 'desc'
  onSort?: (key: string, dir: 'asc' | 'desc') => void
}

export function INVCodeFilter({ selected, onChange, codeOptions = [], activeSortKey, activeSortDir, onSort }: Props) {
  const SORT_KEY = 'code'

  const [open, setOpen]             = useState(false)
  const [rect, setRect]             = useState<DOMRect | null>(null)
  const [inputValue, setInputValue] = useState('')   // bulk text field
  const [listSearch, setListSearch] = useState('')   // search within checkbox list
  const [bulkEnabled, setBulkEnabled] = useState<boolean>(() => {
    // Default true — preserves current behavior for existing users
    return localStorage.getItem('nc-inv-bulk-filter') !== 'false'
  })

  const btnRef   = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasFilter = selected.length > 0

  // On open: populate text field from current selection, reset list search
  useEffect(() => {
    if (open) {
      setListSearch('')
      if (bulkEnabled) {
        setInputValue(selected.join(', '))
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    // Intentionally only [open]: fires once on open to populate/focus.
    // bulkEnabled and selected are captured at open time by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  // Apply bulk text input → closes dropdown
  function applyFilter() {
    const codes = inputValue
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0)
    onChange([...new Set(codes)])
    setOpen(false)
  }

  function handleBulkToggle(enabled: boolean) {
    setBulkEnabled(enabled)
    localStorage.setItem('nc-inv-bulk-filter', String(enabled))
    if (!enabled) {
      setInputValue('')   // limpa o campo ao desativar (sem afetar `selected`)
    }
  }

  // Clear all selections (keeps dropdown open so user can re-select)
  function clear() {
    setInputValue('')
    setListSearch('')
    onChange([])
  }

  // Checkbox toggle — immediate, no Apply needed
  function handleCheck(value: string, checked: boolean) {
    if (checked) onChange([...selected, value])
    else onChange(selected.filter(v => v !== value))
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      const drop = document.getElementById('inv-code-filter-drop')
      if (!drop?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selectedSet     = new Set(selected)
  const filteredOptions = codeOptions.filter(o =>
    !listSearch || o.label.toLowerCase().includes(listSearch.toLowerCase())
  )

  return (
    <>
      {/* ── Trigger button ─────────────────────────────────────── */}
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          width: '100%', padding: '9px 12px',
          background: 'none', border: 'none',
          color: hasFilter ? '#2563eb' : '#a1a1aa',
          fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Code
        {hasFilter && (
          <span style={{ background: '#2563eb', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>
            {selected.length}
          </span>
        )}
        {activeSortKey === SORT_KEY ? (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#2563eb', fontWeight: 800, lineHeight: 1 }}>
            {activeSortDir === 'asc' ? '↑' : '↓'}
          </span>
        ) : (
          <ChevronDown size={10} style={{
            opacity: hasFilter ? 0.8 : 0.45,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            marginLeft: 'auto',
          }} />
        )}
      </button>

      {/* ── Dropdown ───────────────────────────────────────────── */}
      {open && rect && createPortal(
        <div
          id="inv-code-filter-drop"
          style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: 300,
            background: '#fff',
            border: '1px solid #e4e4e7',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 520,
          }}
        >

          {/* 1 — Sort options */}
          {onSort && (
            <div style={{ borderBottom: '1px solid #f4f4f5', flexShrink: 0 }}>
              {(['asc', 'desc'] as const).map(dir => {
                const isActive = activeSortKey === SORT_KEY && activeSortDir === dir
                return (
                  <button
                    key={dir}
                    onClick={() => { onSort(SORT_KEY, dir); setOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '7px 10px',
                      background: isActive ? '#eff6ff' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: isActive ? '#2563eb' : '#52525b',
                      fontSize: 11, fontWeight: isActive ? 700 : 400,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{dir === 'asc' ? '↑' : '↓'}</span>
                    {dir === 'asc' ? 'Sort A → Z' : 'Sort Z → A'}
                    {isActive && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* 2 — Bulk text input */}
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #e4e4e7', flexShrink: 0 }}>

            {/* Toggle header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: bulkEnabled ? 7 : 0 }}>
              <input
                type="checkbox"
                id="inv-bulk-toggle"
                checked={bulkEnabled}
                onChange={e => handleBulkToggle(e.target.checked)}
                style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
              />
              <label
                htmlFor="inv-bulk-toggle"
                style={{
                  fontSize: 10, fontWeight: 700, color: '#a1a1aa',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  cursor: 'pointer', flex: 1,
                }}
              >
                List filter
              </label>
              <span
                title="Special mode: filter multiple codes at once by pasting a comma-separated list. Useful for batch reconciliations and stock checks."
                style={{ cursor: 'help', color: '#a1a1aa', fontSize: 13, lineHeight: 1, userSelect: 'none' }}
              >
                ⓘ
              </span>
            </div>

            {/* Input bulk — só quando ativado */}
            {bulkEnabled && (
              <>
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') applyFilter() }}
                  placeholder="e.g. 6325, 6323, 6324"
                  style={{
                    width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                    border: '1px solid #e4e4e7', background: '#fafafa',
                    fontSize: 12, outline: 'none', color: '#09090b',
                    fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.03em',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
                <div style={{ marginTop: 5, fontSize: 11, color: '#a1a1aa' }}>
                  Press{' '}
                  <kbd style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: 3, padding: '0 4px', fontSize: 10, fontFamily: 'inherit' }}>
                    Enter
                  </kbd>
                  {' '}or click Apply. Unknown codes are ignored.
                </div>
              </>
            )}

          </div>

          {/* 3 — Checkbox list (scoped to current tab via codeOptions) */}
          {codeOptions.length > 0 && (
            <>
              {/* List search + bulk actions */}
              <div style={{ padding: '6px 10px', borderBottom: '1px solid #f4f4f5', flexShrink: 0 }}>
                <input
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Search codes…"
                  style={{
                    width: '100%', padding: '4px 8px', boxSizing: 'border-box',
                    border: '1px solid #e4e4e7', background: '#fafafa',
                    fontSize: 11, outline: 'none', color: '#09090b', marginBottom: 5,
                  }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => onChange(codeOptions.map(o => o.value))}
                    style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    Select All
                  </button>
                  <span style={{ color: '#e4e4e7' }}>|</span>
                  <button
                    onClick={clear}
                    style={{ fontSize: 11, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Scrollable checkbox rows */}
              <div style={{ overflowY: 'auto', maxHeight: 180 }}>
                {filteredOptions.length === 0 ? (
                  <div style={{ padding: '12px 10px', fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>No results</div>
                ) : filteredOptions.map(opt => (
                  <label
                    key={opt.value}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#3f3f46', fontFamily: "'IBM Plex Mono', monospace" }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f4f4f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(opt.value)}
                      onChange={e => handleCheck(opt.value, e.target.checked)}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />
                    {opt.value}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* 4 — Active filter status */}
          {hasFilter && (
            <div style={{
              padding: '5px 10px', borderTop: '1px solid #f4f4f5',
              display: 'flex', alignItems: 'center', background: '#eff6ff', flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                {selected.length} code{selected.length !== 1 ? 's' : ''} active
              </span>
              <button
                onClick={clear}
                style={{ marginLeft: 'auto', fontSize: 11, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Clear all
              </button>
            </div>
          )}

          {/* 5 — Apply button */}
          {bulkEnabled && (
            <div style={{ padding: '8px 10px', borderTop: '1px solid #f4f4f5', flexShrink: 0 }}>
              <button
                onClick={applyFilter}
                style={{
                  width: '100%', padding: '7px',
                  background: '#09090b', border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.04em',
                }}
              >
                Apply Filter
              </button>
            </div>
          )}

        </div>,
        document.body
      )}
    </>
  )
}
