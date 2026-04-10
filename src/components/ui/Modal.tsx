import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  confirmDanger?: boolean
  children: ReactNode
  width?: number
}

export function Modal({ title, onClose, onConfirm, confirmLabel = 'Save', confirmDanger, children, width = 480 }: ModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: width,
        background: '#fff', border: '1px solid #e4e4e7',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e4e4e7',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b', letterSpacing: '-0.3px' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {children}
        </div>

        {/* Footer */}
        {onConfirm && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', background: 'none',
                border: '1px solid #e4e4e7', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: '#71717a',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: '8px 20px',
                background: confirmDanger ? '#ef4444' : '#2563eb',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#fff',
                letterSpacing: '0.03em',
              }}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputBase: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  border: '1px solid #e4e4e7', background: '#fafafa',
  color: '#09090b', fontSize: 13, outline: 'none',
  transition: 'border-color 0.15s',
}

export function Input({ value, onChange, placeholder, type = 'text', step }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; step?: string
}) {
  return (
    <input
      type={type} step={step} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={inputBase}
      onFocus={e => (e.target.style.borderColor = '#2563eb')}
      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
    />
  )
}

export function Select({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: ReactNode
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, cursor: 'pointer' }}
    >
      {children}
    </select>
  )
}

export function Textarea({ value, onChange, rows = 3 }: {
  value: string; onChange: (v: string) => void; rows?: number
}) {
  return (
    <textarea
      value={value} rows={rows}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, resize: 'none' }}
      onFocus={e => (e.target.style.borderColor = '#2563eb')}
      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
    />
  )
}
