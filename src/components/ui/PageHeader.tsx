import type { ReactNode } from 'react'

interface PageHeaderProps {
  section: string
  title: string
  action?: ReactNode
}

export function PageHeader({ section, title, action }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
          {section}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px' }}>
          {title}
        </h1>
      </div>
      {action}
    </div>
  )
}
