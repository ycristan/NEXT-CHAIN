import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ColKey =
  // Core
  | 'status' | 'code' | 'name' | 'category' | 'subcategory' | 'skuType'
  | 'bpu' | 'pallet' | 'notes' | 'binAddress'
  // Commercial
  | 'purchasePrice' | 'wholesalePrice' | 'vendingPrice'
  | 'allowedWholesale' | 'wholesaleUnits' | 'allowedVending'
  | 'isConsumable' | 'isNonStockable' | 'isGlutenFree' | 'isVegan' | 'hseSuitable'
  // Logistics
  | 'caseWeight' | 'caseHeight' | 'caseLength' | 'caseDepth' | 'productWeight' | 'kcal'
  // Barcodes
  | 'barcodes'

interface ColDef { key: ColKey; label: string; group: string }

export const ALL_COLS: ColDef[] = [
  // Core
  { key: 'status',          label: 'Status',            group: 'Core' },
  { key: 'code',            label: 'Brand Code',        group: 'Core' },
  { key: 'name',            label: 'Brand Name',        group: 'Core' },
  { key: 'category',        label: 'Category',          group: 'Core' },
  { key: 'subcategory',     label: 'Subcategory',       group: 'Core' },
  { key: 'skuType',         label: 'SKU Type',          group: 'Core' },
  { key: 'bpu',             label: 'BPU',               group: 'Core' },
  { key: 'pallet',          label: 'Pallet Size',       group: 'Core' },
  { key: 'notes',           label: 'Notes',             group: 'Core' },
  { key: 'binAddress',      label: 'Bin Address',       group: 'Core' },
  // Commercial
  { key: 'purchasePrice',   label: 'Purchase Price',    group: 'Commercial' },
  { key: 'wholesalePrice',  label: 'Wholesale Price',   group: 'Commercial' },
  { key: 'vendingPrice',    label: 'Vending Price',     group: 'Commercial' },
  { key: 'allowedWholesale',label: 'Wholesale Allowed', group: 'Commercial' },
  { key: 'wholesaleUnits',  label: 'Wholesale Units',   group: 'Commercial' },
  { key: 'allowedVending',  label: 'Vending Allowed',   group: 'Commercial' },
  { key: 'isConsumable',    label: 'Consumable',        group: 'Commercial' },
  { key: 'isNonStockable',  label: 'Non-Stockable',     group: 'Commercial' },
  { key: 'isGlutenFree',    label: 'Gluten Free',       group: 'Commercial' },
  { key: 'isVegan',         label: 'Vegan Friendly',    group: 'Commercial' },
  { key: 'hseSuitable',     label: 'HSE Suitable',      group: 'Commercial' },
  // Logistics
  { key: 'caseWeight',      label: 'Case Weight',       group: 'Logistics' },
  { key: 'caseHeight',      label: 'Case Height',       group: 'Logistics' },
  { key: 'caseLength',      label: 'Case Length',       group: 'Logistics' },
  { key: 'caseDepth',       label: 'Case Depth',        group: 'Logistics' },
  { key: 'productWeight',   label: 'Product Weight',    group: 'Logistics' },
  { key: 'kcal',            label: 'Kcal',              group: 'Logistics' },
  // Barcodes
  { key: 'barcodes',        label: 'Barcodes',          group: 'Barcodes' },
]

export const DEFAULT_COLS: ColKey[] = ['status', 'code', 'name', 'category', 'subcategory', 'skuType', 'bpu', 'pallet', 'binAddress']

const COL_GROUPS = ['Core', 'Commercial', 'Logistics', 'Barcodes']

interface ColView {
  id: string
  name: string
  cols: ColKey[]
  is_public: boolean
  created_by: string
}

interface Props {
  visible: ColKey[]
  onChange: (cols: ColKey[]) => void
  userId: string
  isAdmin: boolean
}

export function INVColumnPicker({ visible, onChange, userId, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [views, setViews] = useState<ColView[]>([])
  const [showSave, setShowSave] = useState(false)
  const [savingName, setSavingName] = useState('')
  const [savingPublic, setSavingPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function loadViews() {
    const { data } = await supabase
      .from('inventory_column_views')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setViews(data as ColView[])
  }

  useEffect(() => { void loadViews() }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowSave(false)
        setSavingName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const visSet = new Set(visible)
  const isCustom = visible.length !== DEFAULT_COLS.length ||
    DEFAULT_COLS.some(k => !visSet.has(k)) ||
    visible.some(k => !DEFAULT_COLS.includes(k))

  function toggle(key: ColKey) {
    const next = visSet.has(key) ? visible.filter(k => k !== key) : [...visible, key]
    onChange(next)
  }

  function toggleGroup(group: string) {
    const groupKeys = ALL_COLS.filter(c => c.group === group).map(c => c.key)
    const allOn = groupKeys.every(k => visSet.has(k))
    if (allOn) {
      onChange(visible.filter(k => !groupKeys.includes(k)))
    } else {
      const toAdd = groupKeys.filter(k => !visSet.has(k))
      onChange([...visible, ...toAdd])
    }
  }

  async function handleSave() {
    const name = savingName.trim()
    if (!name || saving) return
    setSaving(true)
    await supabase.from('inventory_column_views').insert({
      name, cols: visible, is_public: savingPublic, created_by: userId,
    })
    await loadViews()
    setSavingName('')
    setSavingPublic(false)
    setShowSave(false)
    setSaving(false)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('inventory_column_views').delete().eq('id', id)
    setViews(prev => prev.filter(v => v.id !== id))
  }

  function applyView(view: ColView) {
    onChange(view.cols)
    setOpen(false)
  }

  const privateViews = views.filter(v => !v.is_public)
  const publicViews = views.filter(v => v.is_public)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px',
          background: isCustom ? '#eff6ff' : 'none',
          border: isCustom ? '1px solid #bfdbfe' : '1px solid #e4e4e7',
          color: isCustom ? '#2563eb' : '#52525b',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Columns{isCustom ? ` (${visible.length})` : ''}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
          background: '#fff', border: '1px solid #e4e4e7',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          width: 260, maxHeight: 560, overflowY: 'auto', padding: '10px 0',
        }}>

          {/* Column groups */}
          {COL_GROUPS.map(group => {
            const groupCols = ALL_COLS.filter(c => c.group === group)
            const allOn = groupCols.every(c => visSet.has(c.key))
            const someOn = groupCols.some(c => visSet.has(c.key))
            return (
              <div key={group}>
                {/* Group header with toggle-all */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px 3px', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={el => { if (el) el.indeterminate = !allOn && someOn }}
                    onChange={() => toggleGroup(group)}
                    style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#71717a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {group}
                  </span>
                </div>
                {groupCols.map(({ key, label }) => (
                  <label
                    key={key}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 28px', cursor: 'pointer', fontSize: 13, userSelect: 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={visSet.has(key)}
                      onChange={() => toggle(key)}
                      style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    <span style={{ color: visSet.has(key) ? '#09090b' : '#a1a1aa' }}>{label}</span>
                  </label>
                ))}
              </div>
            )
          })}

          <div style={{ borderTop: '1px solid #f4f4f5', margin: '8px 0' }} />

          {/* General views */}
          {publicViews.length > 0 && (
            <>
              <div style={{ padding: '0 12px 4px', fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                General Views
              </div>
              {publicViews.map(view => (
                <ViewRow key={view.id} view={view} isAdmin={isAdmin} onApply={applyView} onDelete={handleDelete} />
              ))}
              <div style={{ borderTop: '1px solid #f4f4f5', margin: '6px 0' }} />
            </>
          )}

          {/* Private views */}
          <div style={{ padding: '0 12px 4px', fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            My Views
          </div>
          {privateViews.length === 0 ? (
            <div style={{ padding: '3px 12px 6px', fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>
              No private views yet
            </div>
          ) : (
            privateViews.map(view => (
              <ViewRow key={view.id} view={view} isAdmin={isAdmin} onApply={applyView} onDelete={handleDelete} />
            ))
          )}

          {/* Save current */}
          <div style={{ padding: '8px 12px 2px', borderTop: '1px solid #f4f4f5', marginTop: 4 }}>
            {showSave ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  autoFocus
                  value={savingName}
                  onChange={e => setSavingName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleSave()
                    if (e.key === 'Escape') { setShowSave(false); setSavingName(''); setSavingPublic(false) }
                  }}
                  placeholder="View name..."
                  style={{ fontSize: 12, padding: '5px 8px', border: '1px solid #e4e4e7', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="radio" checked={!savingPublic} onChange={() => setSavingPublic(false)} style={{ accentColor: '#2563eb' }} />
                    Private
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="radio" checked={savingPublic} onChange={() => setSavingPublic(true)} style={{ accentColor: '#2563eb' }} />
                    General
                  </label>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving || !savingName.trim()}
                    style={{
                      marginLeft: 'auto', padding: '4px 10px',
                      background: saving || !savingName.trim() ? '#f4f4f5' : '#09090b',
                      color: saving || !savingName.trim() ? '#a1a1aa' : '#fff',
                      border: 'none', fontSize: 11, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                    }}
                  >
                    {saving ? '...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSave(true)}
                style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                + Save current as view
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ViewRow({
  view, isAdmin, onApply, onDelete,
}: {
  view: ColView
  isAdmin: boolean
  onApply: (v: ColView) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={() => onApply(view)}
      style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', gap: 4, cursor: 'pointer' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ flex: 1, fontSize: 12, color: '#09090b', fontWeight: 500 }}>{view.name}</span>
      <span style={{ fontSize: 10, color: '#a1a1aa' }}>{view.cols.length} col{view.cols.length !== 1 ? 's' : ''}</span>
      {isAdmin && (
        <button
          onClick={e => onDelete(view.id, e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 16, lineHeight: 1, padding: '0 2px', marginLeft: 4 }}
          title="Delete view"
        >
          ×
        </button>
      )}
    </div>
  )
}
