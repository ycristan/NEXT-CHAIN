import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  inHeader?: boolean
  sortKey?: string
  activeSortKey?: string | null
  activeSortDir?: 'asc' | 'desc'
  onSort?: (key: string, dir: 'asc' | 'desc') => void
}

export function INVFilterCombo({ label, options, selected, onChange, inHeader, sortKey, activeSortKey, activeSortDir, onSort }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  const hasFilter = selected.length > 0 && selected.length < options.length

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
    if (!open) setSearch('')
  }

  function handleCheck(value: string, checked: boolean) {
    if (checked) onChange([...selected, value])
    else onChange(selected.filter(v => v !== value))
  }

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      const drop = document.getElementById('inv-fcombo-drop')
      if (!drop?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        style={inHeader ? {
          display: 'flex', alignItems: 'center', gap: 5,
          width: '100%', padding: '9px 12px',
          background: 'none', border: 'none',
          color: hasFilter ? '#2563eb' : '#a1a1aa',
          fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          cursor: 'pointer', whiteSpace: 'nowrap',
        } : {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '5px 10px',
          background: hasFilter ? '#eff6ff' : '#f4f4f5',
          border: hasFilter ? '1px solid #bfdbfe' : '1px solid #e4e4e7',
          color: hasFilter ? '#2563eb' : '#71717a',
          fontSize: 11, fontWeight: hasFilter ? 600 : 400,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {label}
        {hasFilter && (
          <span style={{
            background: '#2563eb', color: '#fff',
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
          }}>
            {selected.length}
          </span>
        )}
        {sortKey && activeSortKey === sortKey ? (
          <span style={{ marginLeft: inHeader ? 'auto' : 0, fontSize: 12, color: '#2563eb', fontWeight: 800, lineHeight: 1 }}>
            {activeSortDir === 'asc' ? '↑' : '↓'}
          </span>
        ) : (
          <ChevronDown size={inHeader ? 10 : 11} style={{
            opacity: hasFilter ? 0.8 : 0.45,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            marginLeft: inHeader ? 'auto' : 0,
          }} />
        )}
      </button>

      {open && rect && createPortal(
        <div
          id="inv-fcombo-drop"
          style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: 230,
            background: '#fff',
            border: '1px solid #e4e4e7',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            zIndex: 9999,
          }}
        >
          {onSort && sortKey && (
            <div style={{ borderBottom: '1px solid #f4f4f5' }}>
              {(['asc', 'desc'] as const).map(dir => {
                const isActive = activeSortKey === sortKey && activeSortDir === dir
                return (
                  <button
                    key={dir}
                    onClick={() => { onSort(sortKey, dir); setOpen(false) }}
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

          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f4f4f5' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%', padding: '5px 8px',
                border: '1px solid #e4e4e7', background: '#fafafa',
                fontSize: 12, outline: 'none', color: '#09090b',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
            />
          </div>

          <div style={{ display: 'flex', padding: '6px 10px', gap: 10, borderBottom: '1px solid #f4f4f5' }}>
            <button
              onClick={() => onChange(options.map(o => o.value))}
              style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
            >
              Select All
            </button>
            <span style={{ color: '#e4e4e7' }}>|</span>
            <button
              onClick={() => onChange([])}
              style={{ fontSize: 11, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Clear
            </button>
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 10px', fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>No results</div>
            ) : filtered.map(opt => (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12, color: '#3f3f46' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f4f4f5')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={e => handleCheck(opt.value, e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
