import { useTabs } from '@/contexts/TabsContext'
import { ComingSoon } from '@/pages/ComingSoon'
import { SystemLibrary } from '@/pages/SystemLibrary'
import { UserProfile } from '@/pages/UserProfile'
import { Inventory } from '@/pages/Inventory'
import { PickingLine } from '@/pages/PickingLine'
import { Fridge } from '@/pages/Fridge'
import {
  LayoutDashboard, Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface PlaceholderDef {
  title: string
  icon: LucideIcon
}

const PLACEHOLDERS: Record<string, PlaceholderDef> = {
  'dashboard': { title: 'Dashboard',        icon: LayoutDashboard },
  'warehouse': { title: 'Warehouse General', icon: Building2 },
}

function renderModule(moduleKey: string) {
  if (PLACEHOLDERS[moduleKey]) {
    const { title, icon } = PLACEHOLDERS[moduleKey]
    return <ComingSoon title={title} icon={icon} />
  }
  if (moduleKey === 'inventory')      return <Inventory />
  if (moduleKey === 'picking-line')   return <PickingLine />
  if (moduleKey === 'fridge')         return <Fridge />
  if (moduleKey === 'system-library') return <SystemLibrary />
  if (moduleKey === 'user')           return <UserProfile />
  return null
}

export function TabContent() {
  const { tabs, activeTabId } = useTabs()

  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          style={{
            position: 'absolute', inset: 0,
            overflow: 'auto', padding: '28px',
            display: tab.id === activeTabId ? 'block' : 'none',
          }}
        >
          {renderModule(tab.moduleKey)}
        </div>
      ))}
    </div>
  )
}
