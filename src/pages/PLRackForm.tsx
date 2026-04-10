import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

interface RackType {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
  parent_id: string | null
}

interface Props {
  existingNames: string[]
  onClose: () => void
  onSaved: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', boxSizing: 'border-box',
  border: '1px solid #e4e4e7', background: '#fafafa',
  color: '#09090b', fontSize: 13, outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5,
}

const fieldStyle: React.CSSProperties = { marginBottom: 16 }

export function PLRackForm({ existingNames, onClose, onSaved }: Props) {
  const { addToast } = useToast()

  const [rackTypes, setRackTypes] = useState<RackType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [rackTypeId, setRackTypeId] = useState('')
  const [columns, setColumns] = useState('')
  const [rows, setRows] = useState('')
  const [soloPos, setSoloPos] = useState('')
  const [comboPos, setComboPos] = useState('')
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    void loadRefs()
  }, [])

  async function loadRefs() {
    const [rtRes, catRes] = await Promise.all([
      supabase.from('rack_types').select('id, name').eq('active', true).order('name'),
      supabase.from('categories').select('id, name, parent_id').eq('active', true).order('name'),
    ])
    setRackTypes(rtRes.data ?? [])
    setCategories(catRes.data ?? [])
  }

  function toggleCat(id: string) {
    setSelectedCats(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  function validate(): boolean {
    const e: Record<string, string> = {}

    const n = name.trim()
    if (!n) { e.name = 'Required.' }
    else if (!/^\d{1,2}$/.test(n)) { e.name = 'Must be 1-2 digits (e.g. 1, 40, 99).' }
    else if (existingNames.includes(n)) { e.name = `Rack "${n}" already exists.` }

    const c = parseInt(columns)
    if (!columns || isNaN(c) || c < 1) e.columns = 'Must be ≥ 1.'
    else if (c > 26) e.columns = 'Max 26 columns (A–Z).'

    const r = parseInt(rows)
    if (!rows || isNaN(r) || r < 1) e.rows = 'Must be ≥ 1.'
    else if (r > 99) e.rows = 'Max 99 rows.'

    if (soloPos && (isNaN(parseInt(soloPos)) || parseInt(soloPos) < 1))
      e.soloPos = 'Must be a positive number.'
    if (comboPos && (isNaN(parseInt(comboPos)) || parseInt(comboPos) < 1))
      e.comboPos = 'Must be a positive number.'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)

    const n = name.trim()
    const colCount = parseInt(columns)
    const rowCount = parseInt(rows)

    // 1 — Insert rack
    const { data: rackData, error: rackErr } = await supabase
      .from('racks')
      .insert({
        name: n,
        rack_type_id: rackTypeId || null,
        columns: colCount,
        rows: rowCount,
        solo_picking_pos: soloPos ? parseInt(soloPos) : null,
        combo_picking_pos: comboPos ? parseInt(comboPos) : null,
        active: true,
      })
      .select('id')
      .single()

    if (rackErr || !rackData) {
      setSaving(false)
      if (rackErr?.code === '23505') {
        setErrors({ name: `Rack "${n}" already exists.` })
      } else {
        addToast(`Error creating rack: ${rackErr?.message ?? 'unknown'}`, 'error')
      }
      return
    }

    const rackId = rackData.id

    // 2 — Insert allowed categories (if any)
    if (selectedCats.length > 0) {
      const { error: catErr } = await supabase
        .from('rack_allowed_categories')
        .insert(selectedCats.map(catId => ({ rack_id: rackId, category_id: catId })))

      if (catErr) {
        addToast(`Rack created but categories failed: ${catErr.message}`, 'error')
        setSaving(false)
        onSaved()
        return
      }
    }

    // 3 — Generate and insert slots
    const slots: { rack_id: string; column_letter: string; row_number: number; bin_address: string }[] = []
    for (let c = 0; c < colCount; c++) {
      const letter = String.fromCharCode(65 + c) // 0=A, 1=B, ...
      for (let r = 1; r <= rowCount; r++) {
        slots.push({
          rack_id: rackId,
          column_letter: letter,
          row_number: r,
          bin_address: `${n} ${letter}${String(r).padStart(2, '0')}`,
        })
      }
    }

    const { error: slotsErr } = await supabase.from('slots').insert(slots)
    setSaving(false)

    if (slotsErr) {
      addToast(`Rack created but slots failed: ${slotsErr.message}`, 'error')
      onSaved()
      return
    }

    addToast(`Rack "${n}" created with ${slots.length} slot${slots.length !== 1 ? 's' : ''}.`, 'success')
    onSaved()
  }

  const parents = categories.filter(c => !c.parent_id)
  const children = (parentId: string) => categories.filter(c => c.parent_id === parentId)
  const totalSlots = (parseInt(columns) || 0) * (parseInt(rows) || 0)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', border: '1px solid #e4e4e7', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>New Rack</span>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

          {/* Row 1: Name + Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Rack Name * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(1-2 digits)</span></label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setErrors(v => ({ ...v, name: '' })) }}
                placeholder="e.g. 40"
                maxLength={2}
                autoFocus
                disabled={saving}
                style={{ ...inputStyle, borderColor: errors.name ? '#dc2626' : '#e4e4e7', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, textAlign: 'center' }}
                onFocus={e => !errors.name && (e.target.style.borderColor = '#2563eb')}
                onBlur={e => !errors.name && (e.target.style.borderColor = '#e4e4e7')}
              />
              {errors.name && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.name}</p>}
            </div>
            <div>
              <label style={labelStyle}>Rack Type</label>
              <select
                value={rackTypeId}
                onChange={e => setRackTypeId(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— No type —</option>
                {rackTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Columns + Rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Columns * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(A–Z, max 26)</span></label>
              <input
                type="number" min={1} max={26}
                value={columns}
                onChange={e => { setColumns(e.target.value); setErrors(v => ({ ...v, columns: '' })) }}
                placeholder="e.g. 3"
                disabled={saving}
                style={{ ...inputStyle, borderColor: errors.columns ? '#dc2626' : '#e4e4e7' }}
                onFocus={e => !errors.columns && (e.target.style.borderColor = '#2563eb')}
                onBlur={e => !errors.columns && (e.target.style.borderColor = '#e4e4e7')}
              />
              {errors.columns && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.columns}</p>}
            </div>
            <div>
              <label style={labelStyle}>Rows * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(max 99)</span></label>
              <input
                type="number" min={1} max={99}
                value={rows}
                onChange={e => { setRows(e.target.value); setErrors(v => ({ ...v, rows: '' })) }}
                placeholder="e.g. 5"
                disabled={saving}
                style={{ ...inputStyle, borderColor: errors.rows ? '#dc2626' : '#e4e4e7' }}
                onFocus={e => !errors.rows && (e.target.style.borderColor = '#2563eb')}
                onBlur={e => !errors.rows && (e.target.style.borderColor = '#e4e4e7')}
              />
              {errors.rows && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.rows}</p>}
            </div>
          </div>

          {/* Slot preview */}
          {totalSlots > 0 && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>
                {totalSlots} slot{totalSlots !== 1 ? 's' : ''} will be generated
              </span>
              {name.trim() && parseInt(columns) > 0 && parseInt(rows) > 0 && /^\d{1,2}$/.test(name.trim()) && (
                <span style={{ fontSize: 11, color: '#60a5fa' }}>
                  — from <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{name.trim()} A01</code> to <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{name.trim()} {String.fromCharCode(64 + parseInt(columns))}{String(parseInt(rows)).padStart(2, '0')}</code>
                </span>
              )}
            </div>
          )}

          {/* Row 3: Picking positions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Solo Picking Position <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <input
                type="number" min={1}
                value={soloPos}
                onChange={e => { setSoloPos(e.target.value); setErrors(v => ({ ...v, soloPos: '' })) }}
                placeholder="e.g. 1"
                disabled={saving}
                style={{ ...inputStyle, borderColor: errors.soloPos ? '#dc2626' : '#e4e4e7' }}
                onFocus={e => !errors.soloPos && (e.target.style.borderColor = '#2563eb')}
                onBlur={e => !errors.soloPos && (e.target.style.borderColor = '#e4e4e7')}
              />
              {errors.soloPos && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.soloPos}</p>}
            </div>
            <div>
              <label style={labelStyle}>Combo Picking Position <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <input
                type="number" min={1}
                value={comboPos}
                onChange={e => { setComboPos(e.target.value); setErrors(v => ({ ...v, comboPos: '' })) }}
                placeholder="e.g. 2"
                disabled={saving}
                style={{ ...inputStyle, borderColor: errors.comboPos ? '#dc2626' : '#e4e4e7' }}
                onFocus={e => !errors.comboPos && (e.target.style.borderColor = '#2563eb')}
                onBlur={e => !errors.comboPos && (e.target.style.borderColor = '#e4e4e7')}
              />
              {errors.comboPos && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.comboPos}</p>}
            </div>
          </div>

          {/* Allowed Categories */}
          <div style={fieldStyle}>
            <label style={labelStyle}>
              Allowed Item Categories
              {selectedCats.length > 0 && (
                <span style={{ marginLeft: 6, background: '#2563eb', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>
                  {selectedCats.length}
                </span>
              )}
            </label>
            <div style={{ border: '1px solid #e4e4e7', background: '#fafafa', maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
              {categories.length === 0 ? (
                <div style={{ padding: '12px 12px', fontSize: 12, color: '#a1a1aa' }}>No categories available</div>
              ) : parents.map(parent => (
                <div key={parent.id}>
                  {/* Parent category row */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', background: '#f4f4f5' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#f4f4f5')}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCats.includes(parent.id)}
                      onChange={() => toggleCat(parent.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#09090b' }}>{parent.name}</span>
                  </label>
                  {/* Child categories */}
                  {children(parent.id).map(child => (
                    <label key={child.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 28px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f4f4f5')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCats.includes(child.id)}
                        onChange={() => toggleCat(child.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12, color: '#52525b' }}>
                        <span style={{ color: '#d4d4d8', marginRight: 6 }}>└</span>
                        {child.name}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Warning about slot generation */}
          {totalSlots > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', background: '#fef9c3', border: '1px solid #fde68a' }}>
              <AlertTriangle size={13} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: '#78350f', margin: 0 }}>
                Saving will insert <strong>{totalSlots} slots</strong> into the database. This cannot be undone automatically — to remove a rack, delete it from the list.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: saving ? 'default' : 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500, opacity: saving ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 24px', background: '#09090b', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: saving ? 0.7 : 1, minWidth: 120 }}
          >
            {saving ? 'Creating...' : `Create Rack${totalSlots > 0 ? ` + ${totalSlots} Slots` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
