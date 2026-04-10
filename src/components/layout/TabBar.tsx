import { X } from 'lucide-react'
import { useTabs, MODULE_DEFS } from '@/contexts/TabsContext'

export function TabBar() {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useTabs()

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      height: 40, background: '#fff',
      borderBottom: '1px solid #e4e4e7',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const def = MODULE_DEFS[tab.moduleKey]
        if (!def) return null
        const Icon = def.icon
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '0 14px',
              cursor: 'pointer',
              borderRight: '1px solid #e4e4e7',
              borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
              background: isActive ? '#fafafa' : '#fff',
              color: isActive ? '#09090b' : '#71717a',
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              transition: 'all 0.12s',
              userSelect: 'none',
              minWidth: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={13} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
            <span>{def.label}</span>
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                style={{
                  marginLeft: 4, background: 'none', border: 'none',
                  cursor: 'pointer', color: '#a1a1aa', padding: 2,
                  display: 'flex', alignItems: 'center', borderRadius: 2,
                  flexShrink: 0,
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#a1a1aa')}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
