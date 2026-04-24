import { useEffect, useRef, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useVirtualizer } from '@tanstack/react-virtual'
import { supabase } from '@/lib/supabase'
import { INVFilterCombo } from './INVFilterCombo'
import { INVCodeFilter } from './INVCodeFilter'
import { INVDetailPanel, type BrandFull } from './INVDetailPanel'
import { INVBrandForm } from './INVBrandForm'
import { INVDeleteConfirm } from './INVDeleteConfirm'
import { INVNotifyAdmin } from './INVNotifyAdmin'
import { INVImport } from './INVImport'
import { INVFixSubcategories } from './INVFixSubcategories'
import { INVColumnPicker, ALL_COLS, DEFAULT_COLS, type ColKey } from './INVColumnPicker'
import { useSystemSettings } from '@/lib/useSystemSettings'

type SubTab = 'all' | 'active' | 'inactive'
type ActiveSubTab = 'allocated' | 'unallocated'

interface TabFilters {
  fStatus: string[]
  fCode: string[]
  fName: string[]
  fCategory: string[]
  fCategory1: string[]
  fSkuType: string[]
  fBpu: string[]
  fPallet: string[]
  fBinAddress: string[]
  sortKey: string | null
  sortDir: 'asc' | 'desc'
}

function emptyFilters(): TabFilters {
  return { fStatus: [], fCode: [], fName: [], fCategory: [], fCategory1: [], fSkuType: [], fBpu: [], fPallet: [], fBinAddress: [], sortKey: null, sortDir: 'asc' }
}

// Module-level store — persists filter/tab/column state across module navigation
const _store: {
  activeTab: SubTab
  tabFilters: Record<SubTab, TabFilters>
  activeSubTab: ActiveSubTab
  subTabFilters: Record<ActiveSubTab, TabFilters>
  visibleCols: ColKey[]
} = {
  activeTab: 'all',
  tabFilters: { all: emptyFilters(), active: emptyFilters(), inactive: emptyFilters() },
  activeSubTab: 'unallocated',
  subTabFilters: { allocated: emptyFilters(), unallocated: emptyFilters() },
  visibleCols: DEFAULT_COLS,
}

const PAGE_SIZE = 1000

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'all',      label: 'All Items' },
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
]

const ACTIVE_SUB_TABS: { key: ActiveSubTab; label: string }[] = [
  { key: 'unallocated', label: 'Unallocated Items' },
  { key: 'allocated',   label: 'Allocated Items' },
]

const thStyle: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left',
  fontSize: 10, fontWeight: 700, color: '#a1a1aa',
  letterSpacing: '0.1em', textTransform: 'uppercase',
  background: '#fafafa', borderBottom: '1px solid #e4e4e7',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid #f4f4f5',
  fontSize: 13, color: '#3f3f46', verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const ROW_HEIGHT = 41

export function Inventory() {
  const { profile, user } = useAuth()
  const isAdmin = profile?.role?.toLowerCase() === 'admin'

  const settings = useSystemSettings()
  const sym = settings?.currencySymbol ?? '€'

  const [brands, setBrands] = useState<BrandFull[]>([])
  const [loading, setLoading] = useState(true)
  const [allocMap, setAllocMap] = useState<Map<string, string[]>>(new Map())
  const [barcodesMap, setBarcodesMap] = useState<Map<string, string[]>>(new Map())
  const [visibleCols, setVisibleColsState] = useState<ColKey[]>(_store.visibleCols)

  const [activeTab, setActiveTabState] = useState<SubTab>(_store.activeTab)
  const [tabFilters, setTabFiltersState] = useState<Record<SubTab, TabFilters>>(_store.tabFilters)
  const [activeSubTab, setActiveSubTabState] = useState<ActiveSubTab>(_store.activeSubTab)
  const [subTabFilters, setSubTabFiltersState] = useState<Record<ActiveSubTab, TabFilters>>(_store.subTabFilters)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingBrand, setEditingBrand] = useState<BrandFull | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [showNotify, setShowNotify] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showFixSubs, setShowFixSubs] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  function setActiveTab(tab: SubTab) {
    _store.activeTab = tab
    setActiveTabState(tab)
  }

  function setActiveSubTab(tab: ActiveSubTab) {
    _store.activeSubTab = tab
    setActiveSubTabState(tab)
  }

  function updateFilter<K extends keyof TabFilters>(key: K, value: TabFilters[K]) {
    if (activeTab === 'active') {
      setSubTabFiltersState(prev => {
        const next = { ...prev, [activeSubTab]: { ...prev[activeSubTab], [key]: value } }
        _store.subTabFilters = next
        return next
      })
    } else {
      setTabFiltersState(prev => {
        const next = { ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }
        _store.tabFilters = next
        return next
      })
    }
  }

  function clearFilters() {
    if (activeTab === 'active') {
      setSubTabFiltersState(prev => {
        const next = { ...prev, [activeSubTab]: emptyFilters() }
        _store.subTabFilters = next
        return next
      })
    } else {
      setTabFiltersState(prev => {
        const next = { ...prev, [activeTab]: emptyFilters() }
        _store.tabFilters = next
        return next
      })
    }
  }

  function updateSort(key: string, dir: 'asc' | 'desc') {
    if (activeTab === 'active') {
      setSubTabFiltersState(prev => {
        const next = { ...prev, [activeSubTab]: { ...prev[activeSubTab], sortKey: key, sortDir: dir } }
        _store.subTabFilters = next
        return next
      })
    } else {
      setTabFiltersState(prev => {
        const next = { ...prev, [activeTab]: { ...prev[activeTab], sortKey: key, sortDir: dir } }
        _store.tabFilters = next
        return next
      })
    }
  }

  useEffect(() => {
    void loadAll()
    void loadAllocMap()
    void loadBarcodesMap()

    // Realtime: refresh alloc map on slot or fridge changes (any tab, any user)
    const channel = supabase.channel('inv-alloc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
        void loadAllocMap()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fridge_items' }, () => {
        void loadAllocMap()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  async function loadAll() {
    setLoading(true)
    let page = 0
    let allBrands: BrandFull[] = []

    while (true) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('brands')
        .select('*, category:category_id(id,name), category1:category1_id(id,name), sku_type:sku_type_id(id,name,code)')
        .order('brand_name')
        .range(from, to)

      if (error) {
        console.error('[Inventory] loadAll error on page', page, error.message)
        break
      }

      if (!data || data.length === 0) break
      allBrands = allBrands.concat(data as BrandFull[])
      if (data.length < PAGE_SIZE) break
      page++
    }

    console.debug(`[Inventory] Total brands loaded from DB: ${allBrands.length}`)
    setBrands(allBrands)
    setLoading(false)
  }

  async function loadBarcodesMap() {
    const { data } = await supabase.from('brand_barcodes').select('brand_id, barcode')
    const map = new Map<string, string[]>()
    for (const row of data ?? []) {
      if (!row.brand_id) continue
      const list = map.get(row.brand_id) ?? []
      list.push(row.barcode)
      map.set(row.brand_id, list)
    }
    setBarcodesMap(map)
  }

  async function loadAllocMap() {
    const [{ data: slotData }, { data: fridgeData }] = await Promise.all([
      supabase.from('slots').select('allocated_brand_id, bin_address').not('allocated_brand_id', 'is', null),
      supabase.from('fridge_items').select('brand_id'),
    ])

    const map = new Map<string, string[]>()

    for (const slot of slotData ?? []) {
      if (!slot.allocated_brand_id || !slot.bin_address) continue
      const addrs = map.get(slot.allocated_brand_id) ?? []
      addrs.push(slot.bin_address)
      map.set(slot.allocated_brand_id, addrs)
    }

    for (const fi of fridgeData ?? []) {
      if (!fi.brand_id) continue
      const addrs = map.get(fi.brand_id) ?? []
      if (!addrs.includes('Fridge')) addrs.push('Fridge')
      map.set(fi.brand_id, addrs)
    }

    setAllocMap(map)
  }

  const uniq = <T,>(arr: T[]) => [...new Set(arr)]

  // Must be declared before tabBase — used to split allocated vs unallocated
  const allocatedBrandIds = new Set(allocMap.keys())

  // Tab base: brands that belong to this tab/sub-tab BEFORE column filters are applied.
  // Filter options are derived from tabBase so they only show values present in the current view.
  const tabBase = brands.filter(b => {
    if (activeTab === 'inactive' && b.is_active) return false
    if (activeTab === 'active') {
      if (!b.is_active) return false
      if (activeSubTab === 'allocated'   && !allocatedBrandIds.has(b.id)) return false
      if (activeSubTab === 'unallocated' &&  allocatedBrandIds.has(b.id)) return false
    }
    return true
  })

  // Filter options derived from tabBase (scoped to current tab/sub-tab)
  const statusOptions = uniq(tabBase.map(b => b.is_active ? 'ACTIVE' : 'INACTIVE')).sort().map(v => ({ value: v, label: v === 'ACTIVE' ? 'Active' : 'Inactive' }))
  const codeOptions   = uniq(tabBase.map(b => b.brand_code)).sort().map(v => ({ value: v, label: v }))
  const nameOptions   = uniq(tabBase.map(b => b.brand_name)).sort().map(v => ({ value: v, label: v }))
  const catOptions    = uniq(tabBase.map(b => b.category?.name ?? '')).filter(Boolean).sort().map(v => ({ value: v, label: v }))
  const cat1Options   = uniq(tabBase.map(b => b.category1?.name ?? '')).filter(Boolean).sort().map(v => ({ value: v, label: v }))
  const skuOptions    = uniq(tabBase.map(b => b.sku_type?.name ?? '')).filter(Boolean).sort().map(v => ({ value: v, label: v }))
  const bpuOptions    = uniq(tabBase.map(b => String(b.bpu))).sort((a, b) => Number(a) - Number(b)).map(v => ({ value: v, label: v }))
  const palletOptions = uniq(tabBase.map(b => b.pallet_size != null ? String(b.pallet_size) : '—')).sort().map(v => ({ value: v, label: v }))

  // Bin address options scoped to brands in tabBase (only meaningful in allocated sub-tab)
  const binAddressOptions = uniq(
    tabBase.flatMap(b => allocMap.get(b.id) ?? [])
  ).sort().map(v => ({ value: v, label: v }))

  // Badge counts
  const activeBrandsCount = brands.filter(b => b.is_active).length
  const allocatedCount    = brands.filter(b => b.is_active && allocatedBrandIds.has(b.id)).length
  const unallocatedCount  = activeBrandsCount - allocatedCount

  const tabCounts: Record<SubTab, number> = {
    all:      brands.length,
    active:   activeBrandsCount,
    inactive: brands.filter(b => !b.is_active).length,
  }

  const subTabCounts: Record<ActiveSubTab, number> = {
    allocated:   allocatedCount,
    unallocated: unallocatedCount,
  }

  // Effective filter — routes to the right store based on active context
  const f = activeTab === 'active' ? subTabFilters[activeSubTab] : tabFilters[activeTab]

  const activeFiltersCount = f.fStatus.length + f.fCode.length + f.fName.length +
    f.fCategory.length + f.fCategory1.length + f.fSkuType.length + f.fBpu.length +
    f.fPallet.length + f.fBinAddress.length

  // Set for O(1) code lookup — critical for performance with 2000+ rows
  const fCodeSet = f.fCode.length > 0 ? new Set(f.fCode) : null

  // Filtered list for current tab
  const filtered = brands.filter(b => {
    const statusVal = b.is_active ? 'ACTIVE' : 'INACTIVE'
    if (activeTab === 'inactive' && b.is_active) return false
    if (activeTab === 'active') {
      if (!b.is_active) return false
      if (activeSubTab === 'allocated'   && !allocatedBrandIds.has(b.id)) return false
      if (activeSubTab === 'unallocated' &&  allocatedBrandIds.has(b.id)) return false
    }
    if (f.fStatus.length    && !f.fStatus.includes(statusVal))                        return false
    if (fCodeSet            && !fCodeSet.has(b.brand_code))                           return false
    if (f.fName.length      && !f.fName.includes(b.brand_name))                       return false
    if (f.fCategory.length  && !f.fCategory.includes(b.category?.name ?? ''))         return false
    if (f.fCategory1.length && !f.fCategory1.includes(b.category1?.name ?? ''))       return false
    if (f.fSkuType.length   && !f.fSkuType.includes(b.sku_type?.name ?? ''))          return false
    if (f.fBpu.length       && !f.fBpu.includes(String(b.bpu)))                       return false
    if (f.fPallet.length    && !f.fPallet.includes(b.pallet_size != null ? String(b.pallet_size) : '—')) return false
    if (f.fBinAddress.length) {
      const brandAddrs = allocMap.get(b.id) ?? []
      if (!brandAddrs.some(addr => f.fBinAddress.includes(addr))) return false
    }
    return true
  })

  const selectedBrand = brands.find(b => b.id === selectedId) ?? null

  // Client-side sort — applied after filter, never touches DB
  const displayList: BrandFull[] = f.sortKey
    ? [...filtered].sort((a, b) => {
        const dir = f.sortDir === 'asc' ? 1 : -1
        switch (f.sortKey) {
          case 'status': {
            const sa = a.is_active ? 'ACTIVE' : 'INACTIVE'
            const sb = b.is_active ? 'ACTIVE' : 'INACTIVE'
            return dir * sa.localeCompare(sb)
          }
          case 'code':      return dir * a.brand_code.localeCompare(b.brand_code)
          case 'name':      return dir * a.brand_name.localeCompare(b.brand_name)
          case 'category':  return dir * (a.category?.name ?? '').localeCompare(b.category?.name ?? '')
          case 'category1': return dir * (a.category1?.name ?? '').localeCompare(b.category1?.name ?? '')
          case 'skuType':   return dir * (a.sku_type?.name ?? '').localeCompare(b.sku_type?.name ?? '')
          case 'bpu':       return dir * (a.bpu - b.bpu)
          case 'pallet':    return dir * ((a.pallet_size ?? 0) - (b.pallet_size ?? 0))
          case 'binAddress': {
            const addrA = (allocMap.get(a.id) ?? []).join(' / ')
            const addrB = (allocMap.get(b.id) ?? []).join(' / ')
            return dir * addrA.localeCompare(addrB)
          }
          default: return 0
        }
      })
    : filtered

  const isAllocatedView = activeTab === 'active' && activeSubTab === 'allocated'

  function setVisibleCols(cols: ColKey[]) {
    _store.visibleCols = cols
    setVisibleColsState(cols)
  }

  const visSet = new Set(visibleCols)
  const vis = (key: ColKey) => visSet.has(key)
  const colSpan = ALL_COLS.filter(c => {
    if (!visSet.has(c.key)) return false
    if (c.key === 'binAddress' && !isAllocatedView) return false
    return true
  }).length

  // Virtualizer — only active when there's data to show
  const virtualizer = useVirtualizer({
    count: displayList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalVirtualSize = virtualizer.getTotalSize()

  function openCreate() { setEditingBrand(null); setShowForm(true) }
  function openEdit() { if (!selectedBrand) return; setEditingBrand(selectedBrand); setShowForm(true) }
  function handleSaved() { setShowForm(false); void loadAll() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Module header */}
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
          Operational
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px' }}>
          Inventory
        </h1>
      </div>

      {/* Main sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e4e4e7', marginBottom: 16, flexShrink: 0 }}>
        {SUB_TABS.map(({ key, label }) => {
          const isActive = activeTab === key
          const tabHasFilters = key === 'active'
            ? Object.values(subTabFilters.allocated).filter(Array.isArray).some(v => v.length > 0) ||
              Object.values(subTabFilters.unallocated).filter(Array.isArray).some(v => v.length > 0)
            : Object.values(tabFilters[key]).filter(Array.isArray).some(v => v.length > 0)
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', background: 'none', border: 'none',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                color: isActive ? '#2563eb' : '#71717a',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.12s', marginBottom: -1, whiteSpace: 'nowrap',
              }}
            >
              {label}
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '1px 6px', borderRadius: 10,
                background: isActive ? '#2563eb' : (tabHasFilters ? '#fef9c3' : '#f4f4f5'),
                color: isActive ? '#fff' : (tabHasFilters ? '#b45309' : '#71717a'),
                minWidth: 18, textAlign: 'center', transition: 'all 0.12s',
              }}>
                {loading ? '—' : tabCounts[key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active inner sub-tabs */}
      {activeTab === 'active' && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, flexShrink: 0, borderBottom: '1px solid #f4f4f5' }}>
          {ACTIVE_SUB_TABS.map(({ key, label }) => {
            const isActive = activeSubTab === key
            const hasFilters = Object.values(subTabFilters[key]).filter(Array.isArray).some(v => v.length > 0)
            return (
              <button
                key={key}
                onClick={() => setActiveSubTab(key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 16px', background: 'none', border: 'none',
                  borderBottom: isActive ? '2px solid #52525b' : '2px solid transparent',
                  color: isActive ? '#09090b' : '#71717a',
                  fontSize: 12, fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.12s', marginBottom: -1, whiteSpace: 'nowrap',
                }}
              >
                {label}
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 10,
                  background: isActive ? '#3f3f46' : (hasFilters ? '#fef9c3' : '#f4f4f5'),
                  color: isActive ? '#fff' : (hasFilters ? '#b45309' : '#71717a'),
                  minWidth: 18, textAlign: 'center', transition: 'all 0.12s',
                }}>
                  {loading ? '—' : subTabCounts[key]}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexShrink: 0 }}>
        <button
          onClick={openCreate}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          <Plus size={13} /> Add Brand
        </button>
        <button
          onClick={() => setShowImport(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'none', border: '1px solid #e4e4e7', color: '#52525b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Upload size={13} /> Import CSV
        </button>
        <button
          onClick={() => setShowFixSubs(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'none', border: '1px solid #e4e4e7', color: '#52525b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Fix Subcategories
        </button>
        <INVColumnPicker
          visible={visibleCols}
          onChange={setVisibleCols}
          userId={user?.id ?? ''}
          isAdmin={isAdmin}
        />

        {activeFiltersCount > 0 && (
          <button
            onClick={clearFilters}
            style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '5px 0' }}
          >
            Clear filters ({activeFiltersCount})
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a1a1aa' }}>
          {filtered.length} record(s)
        </span>
      </div>

      {/* Split view */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', border: '1px solid #e4e4e7', minHeight: 0 }}>

        {/* Table (70%) — scroll container for virtualizer */}
        <div ref={scrollRef} style={{ flex: '0 0 70%', overflowY: 'auto', borderRight: '1px solid #e4e4e7' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ width: 20, height: 20, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'inv-spin 0.8s linear infinite', display: 'inline-block' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: '#a1a1aa', fontSize: 13 }}>
              {brands.length === 0 ? 'No brands yet. Click "Add Brand" to create one.' : 'No results match the current filters.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {vis('status') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="Status" options={statusOptions} selected={f.fStatus} onChange={v => updateFilter('fStatus', v)} inHeader sortKey="status" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('code') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVCodeFilter selected={f.fCode} onChange={v => updateFilter('fCode', v)} codeOptions={codeOptions} activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('name') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="Brand Name" options={nameOptions} selected={f.fName} onChange={v => updateFilter('fName', v)} inHeader sortKey="name" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('category') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="Category" options={catOptions} selected={f.fCategory} onChange={v => updateFilter('fCategory', v)} inHeader sortKey="category" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('subcategory') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="Subcategory" options={cat1Options} selected={f.fCategory1} onChange={v => updateFilter('fCategory1', v)} inHeader sortKey="category1" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('skuType') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="SKU Type" options={skuOptions} selected={f.fSkuType} onChange={v => updateFilter('fSkuType', v)} inHeader sortKey="skuType" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('bpu') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="BPU" options={bpuOptions} selected={f.fBpu} onChange={v => updateFilter('fBpu', v)} inHeader sortKey="bpu" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('pallet') && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="Pallet" options={palletOptions} selected={f.fPallet} onChange={v => updateFilter('fPallet', v)} inHeader sortKey="pallet" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('notes') && <th style={thStyle}>Notes</th>}
                  {vis('binAddress') && isAllocatedView && (
                    <th style={{ ...thStyle, padding: 0 }}>
                      <INVFilterCombo label="Bin Address" options={binAddressOptions} selected={f.fBinAddress} onChange={v => updateFilter('fBinAddress', v)} inHeader sortKey="binAddress" activeSortKey={f.sortKey} activeSortDir={f.sortDir} onSort={updateSort} />
                    </th>
                  )}
                  {vis('purchasePrice')    && <th style={{ ...thStyle, textAlign: 'right' }}>Purchase Price</th>}
                  {vis('wholesalePrice')   && <th style={{ ...thStyle, textAlign: 'right' }}>Wholesale Price</th>}
                  {vis('vendingPrice')     && <th style={{ ...thStyle, textAlign: 'right' }}>Vending Price</th>}
                  {vis('allowedWholesale') && <th style={{ ...thStyle, textAlign: 'center' }}>Wholesale</th>}
                  {vis('wholesaleUnits')   && <th style={{ ...thStyle, textAlign: 'center' }}>Whl. Units</th>}
                  {vis('allowedVending')   && <th style={{ ...thStyle, textAlign: 'center' }}>Vending</th>}
                  {vis('isConsumable')     && <th style={{ ...thStyle, textAlign: 'center' }}>Consumable</th>}
                  {vis('isNonStockable')   && <th style={{ ...thStyle, textAlign: 'center' }}>Non-Stock</th>}
                  {vis('isGlutenFree')     && <th style={{ ...thStyle, textAlign: 'center' }}>Gluten Free</th>}
                  {vis('isVegan')          && <th style={{ ...thStyle, textAlign: 'center' }}>Vegan</th>}
                  {vis('hseSuitable')      && <th style={{ ...thStyle, textAlign: 'center' }}>HSE</th>}
                  {vis('caseWeight')       && <th style={{ ...thStyle, textAlign: 'right' }}>Case Wt.</th>}
                  {vis('caseHeight')       && <th style={{ ...thStyle, textAlign: 'right' }}>Case H</th>}
                  {vis('caseLength')       && <th style={{ ...thStyle, textAlign: 'right' }}>Case L</th>}
                  {vis('caseDepth')        && <th style={{ ...thStyle, textAlign: 'right' }}>Case D</th>}
                  {vis('productWeight')    && <th style={{ ...thStyle, textAlign: 'right' }}>Prod. Wt.</th>}
                  {vis('kcal')             && <th style={{ ...thStyle, textAlign: 'right' }}>Kcal</th>}
                  {vis('barcodes')         && <th style={thStyle}>Barcodes</th>}
                </tr>
              </thead>
              <tbody>
                {/* Top spacer — fills space above rendered virtual rows */}
                {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                  <tr style={{ height: virtualItems[0].start }}>
                    <td colSpan={colSpan} style={{ padding: 0, border: 'none' }} />
                  </tr>
                )}

                {virtualItems.map(virtualRow => {
                  const b = displayList[virtualRow.index]
                  const isSelected = b.id === selectedId
                  const binAddr = isAllocatedView ? (allocMap.get(b.id) ?? []).join(' / ') : null
                  return (
                    <tr
                      key={b.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                      style={{ background: isSelected ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      {vis('status') && (
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px',
                            background: b.is_active ? '#dcfce7' : '#f4f4f5',
                            color: b.is_active ? '#16a34a' : '#71717a',
                          }}>
                            {b.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                      )}
                      {vis('code') && (
                        <td style={tdStyle}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#52525b', background: '#f4f4f5', padding: '2px 7px', letterSpacing: '0.05em' }}>
                            {b.brand_code}
                          </span>
                        </td>
                      )}
                      {vis('name') && (
                        <td style={{ ...tdStyle, fontWeight: isSelected ? 600 : 500, color: '#09090b' }}>{b.brand_name}</td>
                      )}
                      {vis('category') && (
                        <td style={tdStyle}>{b.category?.name ?? '—'}</td>
                      )}
                      {vis('subcategory') && (
                        <td style={{ ...tdStyle, color: '#71717a' }}>{b.category1?.name ?? '—'}</td>
                      )}
                      {vis('skuType') && (
                        <td style={tdStyle}>{b.sku_type ? `${b.sku_type.name} (${b.sku_type.code})` : '—'}</td>
                      )}
                      {vis('bpu') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.bpu}</td>
                      )}
                      {vis('pallet') && (
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>{b.pallet_size ?? '—'}</td>
                      )}
                      {vis('notes') && (
                        <td style={{ ...tdStyle, color: '#71717a', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.notes ?? '—'}</td>
                      )}
                      {vis('binAddress') && isAllocatedView && (
                        <td style={{ ...tdStyle, color: '#2563eb', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                          {binAddr || '—'}
                        </td>
                      )}
                      {vis('purchasePrice') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.purchase_price != null ? `${sym}${b.purchase_price.toFixed(2)}` : '—'}
                        </td>
                      )}
                      {vis('wholesalePrice') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.wholesale_price_outer != null ? `${sym}${b.wholesale_price_outer.toFixed(2)}` : '—'}
                        </td>
                      )}
                      {vis('vendingPrice') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.vending_price != null ? `${sym}${b.vending_price.toFixed(2)}` : '—'}
                        </td>
                      )}
                      {vis('allowedWholesale') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.allowed_wholesale ? '✓' : '—'}</td>
                      )}
                      {vis('wholesaleUnits') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.wholesale_units_allowed ? '✓' : '—'}</td>
                      )}
                      {vis('allowedVending') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.allowed_vending ? '✓' : '—'}</td>
                      )}
                      {vis('isConsumable') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.is_consumable ? '✓' : '—'}</td>
                      )}
                      {vis('isNonStockable') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.is_non_stockable ? '✓' : '—'}</td>
                      )}
                      {vis('isGlutenFree') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.is_gluten_free ? '✓' : '—'}</td>
                      )}
                      {vis('isVegan') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.is_vegan_friendly ? '✓' : '—'}</td>
                      )}
                      {vis('hseSuitable') && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{b.hse_suitable ? '✓' : '—'}</td>
                      )}
                      {vis('caseWeight') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.case_weight != null ? `${b.case_weight} kg` : '—'}
                        </td>
                      )}
                      {vis('caseHeight') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.case_height != null ? `${b.case_height} cm` : '—'}
                        </td>
                      )}
                      {vis('caseLength') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.case_length != null ? `${b.case_length} cm` : '—'}
                        </td>
                      )}
                      {vis('caseDepth') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.case_depth != null ? `${b.case_depth} cm` : '—'}
                        </td>
                      )}
                      {vis('productWeight') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.product_weight != null ? `${b.product_weight} kg` : '—'}
                        </td>
                      )}
                      {vis('kcal') && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.kcal != null ? b.kcal : '—'}
                        </td>
                      )}
                      {vis('barcodes') && (
                        <td style={{ ...tdStyle, color: '#71717a', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {(barcodesMap.get(b.id) ?? []).join(', ') || '—'}
                        </td>
                      )}
                    </tr>
                  )
                })}

                {/* Bottom spacer — fills space below rendered virtual rows */}
                {virtualItems.length > 0 && (
                  <tr style={{ height: totalVirtualSize - virtualItems[virtualItems.length - 1].end }}>
                    <td colSpan={colSpan} style={{ padding: 0, border: 'none' }} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel (30%) */}
        <div style={{ flex: '0 0 30%', overflow: 'hidden' }}>
          <INVDetailPanel
            brand={selectedBrand}
            onEdit={openEdit}
            onRefresh={loadAll}
            onDelete={() => setShowDelete(true)}
            onNotifyAdmin={() => setShowNotify(true)}
          />
        </div>
      </div>

      {showForm && (
        <INVBrandForm
          brand={editingBrand}
          existingCodes={brands.map(b => b.brand_code)}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}

      {showDelete && selectedBrand && (
        <INVDeleteConfirm
          brand={selectedBrand}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); setSelectedId(null); void loadAll() }}
        />
      )}

      {showNotify && selectedBrand && (
        <INVNotifyAdmin
          brand={selectedBrand}
          onClose={() => setShowNotify(false)}
        />
      )}

      {showImport && (
        <INVImport
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); void loadAll() }}
        />
      )}

      {showFixSubs && (
        <INVFixSubcategories
          onClose={() => setShowFixSubs(false)}
          onDone={() => { void loadAll() }}
        />
      )}

      <style>{`@keyframes inv-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
