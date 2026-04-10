import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { TabContent } from './TabContent'

export function Layout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('nc-sidebar') === 'true'
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarW = collapsed ? 56 : 240

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('nc-sidebar', String(next))
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f4f4f5' }}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          overflow: 'hidden', minWidth: 0,
          marginLeft: sidebarW,
          transition: 'margin-left 0.2s ease',
        }}
        className="nc-main"
      >
        {/* Mobile top bar */}
        <div className="nc-mobile-bar" style={{
          display: 'none', height: 48, alignItems: 'center',
          padding: '0 16px', background: '#fff',
          borderBottom: '1px solid #e4e4e7', flexShrink: 0, gap: 12,
        }}>
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', padding: 4 }}
          >
            <Menu size={18} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#09090b', letterSpacing: '-0.3px' }}>
            NEXT CHAIN
          </span>
        </div>

        {/* Tab bar */}
        <TabBar />

        {/* Content */}
        <TabContent />
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .nc-main { margin-left: 0 !important; }
          .nc-mobile-bar { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
