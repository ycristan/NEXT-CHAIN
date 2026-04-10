import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

interface RackType { id: string; name: string }
interface Category { id: string; name: string; parent_id: string | null }

interface RackToEdit {
  id: string
  name: string
  rack_type_id: string | null
  columns: number
  rows: number
  solo_picking_pos: number | null
  combo_picking_pos: number | null
}

interface Props {
  rack: RackToEdit
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

export function PLRackEditModal({ rack, onClose, onSaved }: Props) {
  const { addToast } = useToast()

  const [rackTypes, setRackTypes]     = useState<RackType[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [rackTypeId, setRackTypeId]   = useState(rack.rack_type_id ?? '')
  const [soloPos, setSoloPos]         = useState(rack.solo_picking_pos?.toString() ?? '')
  const [comboPos, setComboPos]       = useState(rack.combo_picking_pos?.toString() ?? '')
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [saving, setSaving]           = useState(false)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [errors, setErrors]           = useState<Record<string, string>>({})

  useEffect(() => { void loadRefs() }, [])

  async function loadRefs() {
    const [rtRes, catRes, racRes] = await Promise.all([
      supabase.from('rack_types').select('id, name').eq('active', true).order('name'),
      supabase.from('categories').select('id, name, parent_id').eq('active', true).order('name'),
      supabase.from('rack_allowed_categories').select('category_id').eq('rack_id', rack.id),
    ])
    setRackTypes(rtRes.data ?? [])
    setCategories(catRes.data ?? [])
    setSelectedCats((racRes.data ?? []).map((r: { category_id: string }) => r.category_id))
    setLoadingRefs(false)
  }

  function toggleCat(id: string) {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (soloPos && (isNaN(parseInt(soloPos)) || parseInt(soloPos) < 1)) e.soloPos = 'Must be a positive number.'
    if (comboPos && (isNaN(parseInt(comboPos)) || parseInt(comboPos) < 1)) e.comboPos = 'Must be a positive number.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)

    // 1 — Update rack row
    const { error: rackErr } = await supabase
      .from('racks')
      .update({
        rack_type_id: rackTypeId || null,
        solo_picking_pos: soloPos ? parseInt(soloPos) : null,
        combo_picking_pos: comboPos ? parseInt(comboPos) : null,
      })
      .eq('id', rack.id)

    if (rackErr) {
      addToast(`Error updating rack: ${rackErr.message}`, 'error')
      setSaving(false)
      return
    }

    // 2 — Replace allowed categories: delete all, re-insert selected
    const { error: delErr } = await supabase
      .from('rack_allowed_categories')
      .delete()
      .eq('rack_id', rack.id)

    if (delErr) {
      addToast(`Error updating categories: ${delErr.message}`, 'error')
      setSaving(false)
      return
    }

    if (selectedCats.length > 0) {
      const { error: insErr } = await supabase
        .from('rack_allowed_categories')
        .insert(selectedCats.map(catId => ({ rack_id: rack.id, category_id: catId })))

      if (insErr) {
        addToast(`Categories partially saved: ${insErr.message}`, 'error')
        setSaving(false)
        onSaved()
        return
      }
    }

    addToast(`Rack ${rack.name} updated.`, 'success')
    onSaved()
  }

  const parents  = categories.filter(c => !c.parent_id)
  const children = (pid: string) => categories.filter(c => c.parent_id === pid)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #e4e4e7', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>Edit Rack </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{rack.name}</span>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

          {loadingRefs ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div style={{ width: 18, height: 18, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl-spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* Rack name — read-only */}
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f4f4f5', border: '1px solid #e4e4e7', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Rack Name</div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 800, color: '#09090b' }}>{rack.name}</span>
                </div>
                <div style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 4 }}>
                  Rack name cannot be changed — it is embedded in all bin addresses ({rack.name} A01, {rack.name} B02…).
                </div>
              </div>

              {/* Dimensions — read-only */}
              <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Columns</label>
                  <div style={{ ...inputStyle, background: '#f4f4f5', color: '#71717a' }}>{rack.columns}</div>
                </div>
                <div>
                  <label style={labelStyle}>Rows</label>
                  <div style={{ ...inputStyle, background: '#f4f4f5', color: '#71717a' }}>{rack.rows}</div>
                </div>
              </div>
              <div style={{ marginBottom: 16, display: 'flex', gap: 6, alignItems: 'flex-start', padding: '7px 10px', background: '#fef9c3', border: '1px solid #fde68a' }}>
                <AlertTriangle size={12} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 11, color: '#78350f' }}>Dimensions are locked after creation to protect slot integrity.</span>
              </div>

              {/* Rack Type */}
              <div style={{ marginBottom: 16 }}>
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

              {/* Picking positions */}
              <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <div style={{ marginBottom: 16 }}>
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
                    <div style={{ padding: '12px', fontSize: 12, color: '#a1a1aa' }}>No categories available</div>
                  ) : parents.map(parent => (
                    <div key={parent.id}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', background: '#f4f4f5' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#f4f4f5')}
                      >
                        <input type="checkbox" checked={selectedCats.includes(parent.id)} onChange={() => toggleCat(parent.id)} style={{ cursor: 'pointer' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#09090b' }}>{parent.name}</span>
                      </label>
                      {children(parent.id).map(child => (
                        <label key={child.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 28px', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f4f4f5')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <input type="checkbox" checked={selectedCats.includes(child.id)} onChange={() => toggleCat(child.id)} style={{ cursor: 'pointer' }} />
                          <span style={{ fontSize: 12, color: '#52525b' }}>
                            <span style={{ color: '#d4d4d8', marginRight: 6 }}>└</span>{child.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Category warning */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <AlertTriangle size={12} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11, color: '#7c2d12', margin: 0, lineHeight: 1.5 }}>
                  Items from categories removed from the allow-list will <strong>remain allocated</strong> until manually removed. This change does not unallocate existing items.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: saving ? 'default' : 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500, opacity: saving ? 0.5 : 1 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || loadingRefs}
            style={{ padding: '8px 24px', background: '#09090b', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: saving || loadingRefs ? 0.7 : 1, minWidth: 100 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
