import type { ReactNode } from 'react'

interface Column {
  label: string
  align?: 'left' | 'right' | 'center'
  hide?: 'sm' | 'md' | 'lg'
}

interface TableProps {
  columns: Column[]
  children: ReactNode
  empty?: string
  loading?: boolean
}

const thStyle = (align: string): React.CSSProperties => ({
  padding: '10px 16px',
  textAlign: align as 'left' | 'right' | 'center',
  fontSize: 10, fontWeight: 700, color: '#a1a1aa',
  letterSpacing: '0.1em', textTransform: 'uppercase',
  borderBottom: '1px solid #e4e4e7', whiteSpace: 'nowrap',
  background: '#fafafa',
})

export function Table({ columns, children, empty = 'No records found', loading }: TableProps) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.label} style={thStyle(col.align ?? 'left')}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </td>
            </tr>
          ) : (children as React.ReactElement)?.props?.children?.length === 0 || !children ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: '#a1a1aa' }}>
                {empty}
              </td>
            </tr>
          ) : children}
        </tbody>
      </table>
    </div>
  )
}

export const tdStyle = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
  padding: '13px 16px',
  textAlign: align,
  borderBottom: '1px solid #f4f4f5',
  color: '#3f3f46',
  verticalAlign: 'middle',
})

export const tdPrimary: React.CSSProperties = {
  padding: '13px 16px',
  borderBottom: '1px solid #f4f4f5',
  color: '#09090b',
  fontWeight: 600,
  verticalAlign: 'middle',
}

export function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 7, flexShrink: 0 }} />
}

export function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', fontSize: 11, fontWeight: 600,
      color, background: bg, letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  )
}

export function ActionBtn({ onClick, color, children }: { onClick: () => void; color: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#a1a1aa', padding: '4px 6px', display: 'inline-flex', alignItems: 'center',
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = color)}
      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa')}
    >
      {children}
    </button>
  )
}
