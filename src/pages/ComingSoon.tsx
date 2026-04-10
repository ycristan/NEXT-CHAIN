import type { LucideIcon } from 'lucide-react'
import { Clock } from 'lucide-react'

interface ComingSoonProps {
  title: string
  icon?: LucideIcon
}

export function ComingSoon({ title, icon: Icon = Clock }: ComingSoonProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72,
        border: '1px solid #e4e4e7',
        background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <Icon size={28} strokeWidth={1} color="#a1a1aa" />
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>
        Module under development
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px', marginBottom: 10 }}>
        {title}
      </h2>

      <p style={{ fontSize: 13, color: '#71717a', maxWidth: 320, lineHeight: 1.6 }}>
        This feature is currently being developed and will be available soon.
      </p>

      <div style={{
        marginTop: 32, padding: '8px 20px',
        border: '1px solid #e4e4e7', background: '#fafafa',
        fontSize: 11, fontWeight: 600, color: '#a1a1aa',
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        Coming Soon
      </div>
    </div>
  )
}
