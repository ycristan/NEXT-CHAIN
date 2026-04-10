import {
  LayoutDashboard, Package, ClipboardList, Building2,
  Snowflake, Library, UserCircle, LogOut,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTabs } from '@/contexts/TabsContext'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

const OPERATIONAL = [
  { key: 'dashboard',    icon: LayoutDashboard, label: 'Dashboard',         soon: true  },
  { key: 'inventory',    icon: Package,          label: 'Inventory',         soon: false },
  { key: 'picking-line', icon: ClipboardList,    label: 'Picking Line',      soon: false },
  { key: 'warehouse',    icon: Building2,         label: 'Warehouse General', soon: true  },
  { key: 'fridge',       icon: Snowflake,         label: 'Fridge',            soon: false },
]

const SYSTEM = [
  { key: 'system-library', icon: Library,    label: 'System Library' },
  { key: 'user',           icon: UserCircle, label: 'User' },
]

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const { openTab, activeTabId, tabs } = useTabs()
  const w = collapsed ? 56 : 240

  function handleItem(moduleKey: string) {
    openTab(moduleKey)
    onMobileClose()
  }

  function isActive(moduleKey: string) {
    const activeTab = tabs.find(t => t.id === activeTabId)
    return activeTab?.moduleKey === moduleKey
  }

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center',
    gap: collapsed ? 0 : 10,
    padding: collapsed ? '10px 0' : '9px 18px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    width: '100%', background: active ? '#eff6ff' : 'none',
    border: 'none', borderLeft: active ? '2px solid #2563eb' : '2px solid transparent',
    cursor: 'pointer', textDecoration: 'none',
    fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#2563eb' : '#52525b',
    transition: 'all 0.12s', whiteSpace: 'nowrap', overflow: 'hidden',
  })

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: '#a1a1aa',
    letterSpacing: '0.15em', textTransform: 'uppercase',
    padding: collapsed ? '10px 0 4px' : '10px 18px 4px',
    textAlign: collapsed ? 'center' : 'left',
  }

  return (
    <>
      {mobileOpen && (
        <div onClick={onMobileClose} style={{
          position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.3)',
        }} />
      )}

      <aside
        className={`nc-sidebar${mobileOpen ? ' nc-sidebar-open' : ''}`}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 30,
          width: w, display: 'flex', flexDirection: 'column',
          background: '#fff', borderRight: '1px solid #e4e4e7',
          transition: 'width 0.2s ease, transform 0.2s ease',
          overflowX: 'hidden', overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{
          height: 56, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 14px' : '0 14px 0 18px',
          borderBottom: '1px solid #e4e4e7',
          justifyContent: collapsed ? 'center' : 'space-between',
          flexShrink: 0,
        }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 26, height: 26, background: '#2563eb', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, color: '#fff',
              }}>NC</div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#2563eb', letterSpacing: '0.2em', textTransform: 'uppercase', lineHeight: 1 }}>NEXT CHAIN</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b', lineHeight: 1.5 }}>Warehouse</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{ width: 26, height: 26, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>
              NC
            </div>
          )}
          <button onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#a1a1aa', padding: 4, display: 'flex', flexShrink: 0,
            marginLeft: collapsed ? 0 : 4,
          }}>
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          <div style={sectionLabel}>{collapsed ? '·' : 'Operational'}</div>

          {OPERATIONAL.map(({ key, icon: Icon, label, soon }) => (
            <button key={key} onClick={() => handleItem(key)} title={collapsed ? label : undefined} style={itemStyle(isActive(key))}
              onMouseEnter={e => { if (!isActive(key)) { (e.currentTarget as HTMLElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLElement).style.color = '#09090b' } }}
              onMouseLeave={e => { if (!isActive(key)) { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#52525b' } }}
            >
              <Icon size={15} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>}
              {!collapsed && soon && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#c4c4c7', background: '#f4f4f5', padding: '2px 5px', flexShrink: 0 }}>
                  SOON
                </span>
              )}
            </button>
          ))}

          <div style={{ height: 1, background: '#e4e4e7', margin: '8px 0' }} />
          <div style={sectionLabel}>{collapsed ? '·' : 'System'}</div>

          {SYSTEM.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => handleItem(key)} title={collapsed ? label : undefined} style={itemStyle(isActive(key))}
              onMouseEnter={e => { if (!isActive(key)) { (e.currentTarget as HTMLElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLElement).style.color = '#09090b' } }}
              onMouseLeave={e => { if (!isActive(key)) { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#52525b' } }}
            >
              <Icon size={15} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}

          <button
            onClick={signOut} title={collapsed ? 'Log out' : undefined}
            style={{ ...itemStyle(false), color: '#52525b' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; (e.currentTarget as HTMLElement).style.color = '#dc2626' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#52525b' }}
          >
            <LogOut size={15} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Log out</span>}
          </button>
        </nav>

        {/* User footer */}
        {profile && (
          <div style={{
            padding: collapsed ? '12px 0' : '12px 18px',
            borderTop: '1px solid #e4e4e7',
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10, flexShrink: 0,
          }}>
            <div title={collapsed ? profile.full_name : undefined} style={{
              width: 28, height: 28, background: '#2563eb', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
            }}>
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#09090b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.full_name}
                </div>
                <div style={{ fontSize: 10, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {profile.role}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      <style>{`
        @media (max-width: 1023px) {
          .nc-sidebar { transform: translateX(-100%); }
          .nc-sidebar.nc-sidebar-open { transform: translateX(0); }
        }
        @media (min-width: 1024px) {
          .nc-sidebar { transform: translateX(0) !important; }
        }
      `}</style>
    </>
  )
}
