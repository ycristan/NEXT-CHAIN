import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  LayoutDashboard, Package, ClipboardList, Building2,
  Snowflake, Library, UserCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ModuleDef {
  label: string
  icon: LucideIcon
  available: boolean
}

export const MODULE_DEFS: Record<string, ModuleDef> = {
  'dashboard':      { label: 'Dashboard',        icon: LayoutDashboard, available: false },
  'inventory':      { label: 'Inventory',         icon: Package,         available: true  },
  'picking-line':   { label: 'Picking Line',      icon: ClipboardList,   available: false },
  'warehouse':      { label: 'Warehouse General', icon: Building2,       available: false },
  'fridge':         { label: 'Fridge',            icon: Snowflake,       available: false },
  'system-library': { label: 'System Library',    icon: Library,         available: true  },
  'user':           { label: 'User',              icon: UserCircle,      available: true  },
}

export interface Tab {
  id: string
  moduleKey: string
}

interface TabsContextType {
  tabs: Tab[]
  activeTabId: string
  openTab: (moduleKey: string) => void
  closeTab: (tabId: string) => void
  setActiveTabId: (id: string) => void
}

const TabsContext = createContext<TabsContextType | undefined>(undefined)

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'system-library', moduleKey: 'system-library' }])
  const [activeTabId, setActiveTabId] = useState('system-library')

  function openTab(moduleKey: string) {
    const existing = tabs.find(t => t.moduleKey === moduleKey)
    if (existing) { setActiveTabId(existing.id); return }
    const id = moduleKey
    setTabs(prev => [...prev, { id, moduleKey }])
    setActiveTabId(id)
  }

  function closeTab(tabId: string) {
    if (tabs.length <= 1) return
    const idx = tabs.findIndex(t => t.id === tabId)
    const next = tabs.filter(t => t.id !== tabId)
    setTabs(next)
    if (activeTabId === tabId) setActiveTabId(next[Math.min(idx, next.length - 1)].id)
  }

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, setActiveTabId }}>
      {children}
    </TabsContext.Provider>
  )
}

export function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs must be used within TabsProvider')
  return ctx
}
