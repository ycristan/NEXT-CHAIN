import { Menu, Bell, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile, signOut } = useAuth()

  return (
    <header style={{
      height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', background: '#fff', borderBottom: '1px solid #e4e4e7',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={onMenuClick}
          style={{
            display: 'none', background: 'none', border: 'none',
            cursor: 'pointer', color: '#71717a', padding: 4,
          }}
          className="lg:hidden"
        >
          <Menu size={18} />
        </button>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Warehouse Manager
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#a1a1aa', padding: '6px 8px',
          display: 'flex', alignItems: 'center',
        }}>
          <Bell size={16} />
        </button>

        <div style={{ width: 1, height: 20, background: '#e4e4e7', margin: '0 8px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, background: '#2563eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
          }}>
            {profile?.full_name.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#3f3f46', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.full_name}
          </span>
        </div>

        <button
          onClick={signOut}
          title="Sair"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#a1a1aa', padding: '6px 8px', marginLeft: 4,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#ef4444')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa')}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
