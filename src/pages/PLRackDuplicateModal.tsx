import { useEffect, useState } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

interface SlotSnapshot {
  column_letter: string
  row_number: number
  allocated_brand_id: string | null
  slot_state: string
  light_address: string | null
  light_status: string
}

interface RackToDuplicate {
  id: string
  name: string
  rack_type_id: string | null
  columns: number
  rows: number
  solo_picking_pos: number | null
  combo_picking_pos: number | null
}

interface Props {
  rack: RackToDuplicate
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

export function PLRackDuplicateModal({ rack, existingNames, onClose, onSaved }: Props) {
  const { addToast } = useToast()

  const [newName, setNewName]           = useState('')
  const [copyAllocs, setCopyAllocs]     = useState(false)
  const [nameError, setNameError]       = useState('')
  const [saving, setSaving]             = useState(false)
  const [progress, setProgress]         = useState('')

  // Pre-fetch source slots once on mount
  const [sourceSlots, setSourceSlots]   = useState<SlotSnapshot[]>([])
  const [sourceCatIds, setSourceCatIds] = useState<string[]>([])

  useEffect(() => { void loadSource() }, [])

  async function loadSource() {
    const [slotsRes, catRes] = await Promise.all([
      supabase
        .from('slots')
        .select('column_letter, row_number, allocated_brand_id, slot_state, light_address, light_status')
        .eq('rack_id', rack.id)
        .order('column_letter').order('row_number'),
      supabase
        .from('rack_allowed_categories')
        .select('category_id')
        .eq('rack_id', rack.id),
    ])
    setSourceSlots((slotsRes.data ?? []) as SlotSnapshot[])
    setSourceCatIds((catRes.data ?? []).map((r: { category_id: string }) => r.category_id))
  }

  function validateName(): boolean {
    const n = newName.trim()
    if (!n) { setNameError('Required.'); return false }
    if (!/^\d{1,2}$/.test(n)) { setNameError('Must be 1-2 digits (e.g. 1, 40, 99).'); return false }
    if (existingNames.includes(n)) { setNameError(`Rack "${n}" already exists.`); return false }
    setNameError('')
    return true
  }

  async function handleDuplicate() {
    if (!validateName()) return
    setSaving(true)
    const n = newName.trim()

    // ── Step 1: Create new rack ──────────────────────────────────
    setProgress('Creating rack…')
    const { data: newRack, error: rackErr } = await supabase
      .from('racks')
      .insert({
        name: n,
        rack_type_id: rack.rack_type_id,
        columns: rack.columns,
        rows: rack.rows,
        solo_picking_pos: rack.solo_picking_pos,
        combo_picking_pos: rack.combo_picking_pos,
        active: true,
      })
      .select('id')
      .single()

    if (rackErr || !newRack) {
      if (rackErr?.code === '23505') setNameError(`Rack "${n}" already exists.`)
      else addToast(`Error creating rack: ${rackErr?.message ?? 'unknown'}`, 'error')
      setSaving(false)
      setProgress('')
      return
    }

    const newRackId = newRack.id

    // ── Step 2: Copy allowed categories ─────────────────────────
    if (sourceCatIds.length > 0) {
      setProgress('Copying categories…')
      await supabase
        .from('rack_allowed_categories')
        .insert(sourceCatIds.map(catId => ({ rack_id: newRackId, category_id: catId })))
    }

    // ── Step 3: Generate slots ───────────────────────────────────
    setProgress('Generating slots…')

    // Build slot map from source for quick lookup
    const sourceMap = new Map<string, SlotSnapshot>()
    for (const s of sourceSlots) sourceMap.set(`${s.column_letter}-${s.row_number}`, s)

    const slotsToInsert: Record<string, unknown>[] = []
    for (let c = 0; c < rack.columns; c++) {
      const letter = String.fromCharCode(65 + c)
      for (let rn = 1; rn <= rack.rows; rn++) {
        const src = sourceMap.get(`${letter}-${rn}`)
        const binAddr = `${n} ${letter}${String(rn).padStart(2, '0')}`

        const slot: Record<string, unknown> = {
          rack_id: newRackId,
          column_letter: letter,
          row_number: rn,
          bin_address: binAddr,
          light_address: src?.light_address ?? null,
          light_status: src?.light_status ?? 'off',
        }

        // Copy allocations if requested, only for brand_allocated slots
        if (copyAllocs && src?.slot_state === 'brand_allocated' && src.allocated_brand_id) {
          slot.allocated_brand_id = src.allocated_brand_id
          slot.slot_state = 'brand_allocated'
        }

        slotsToInsert.push(slot)
      }
    }

    const { error: slotsErr } = await supabase.from('slots').insert(slotsToInsert)

    if (slotsErr) {
      // If allocation copy caused a uniqueness conflict, retry without allocations
      if (slotsErr.code === '23505' && copyAllocs) {
        addToast('Some brands are already allocated in the same rack type — duplicating without allocations.', 'error')
        // Retry: insert slots without allocations
        const clean = slotsToInsert.map(s => {
          const { allocated_brand_id: _a, slot_state: _ss, ...rest } = s as Record<string, unknown>
          return rest
        })
        const { error: retryErr } = await supabase.from('slots').insert(clean)
        if (retryErr) {
          addToast(`Rack created but slot generation failed: ${retryErr.message}`, 'error')
          setSaving(false)
          setProgress('')
          onSaved()
          return
        }
      } else {
        addToast(`Rack created but slot generation failed: ${slotsErr.message}`, 'error')
        setSaving(false)
        setProgress('')
        onSaved()
        return
      }
    }

    const totalSlots = rack.columns * rack.rows
    addToast(
      `Rack "${n}" created with ${totalSlots} slot${totalSlots !== 1 ? 's' : ''}${copyAllocs ? ' + allocations' : ''}.`,
      'success'
    )
    setSaving(false)
    setProgress('')
    onSaved()
  }

  const totalSlots = rack.columns * rack.rows
  const allocatedCount = sourceSlots.filter(s => s.slot_state === 'brand_allocated').length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', border: '1px solid #e4e4e7', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Copy size={15} color="#52525b" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>
              Duplicate Rack <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#2563eb' }}>{rack.name}</span>
            </span>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>

          {/* Source summary */}
          <div style={{ marginBottom: 20, padding: '10px 12px', background: '#f4f4f5', border: '1px solid #e4e4e7', fontSize: 12, color: '#52525b', lineHeight: 1.6 }}>
            <strong style={{ color: '#09090b' }}>Rack {rack.name}</strong> — {rack.columns} col × {rack.rows} row = {totalSlots} slots
            {allocatedCount > 0 && (
              <span style={{ marginLeft: 8, color: '#16a34a', fontWeight: 600 }}>{allocatedCount} allocated</span>
            )}
          </div>

          {/* New name */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>New Rack Name * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(1-2 digits)</span></label>
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setNameError('') }}
              placeholder="e.g. 44"
              maxLength={2}
              autoFocus
              disabled={saving}
              style={{ ...inputStyle, borderColor: nameError ? '#dc2626' : '#e4e4e7', fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, textAlign: 'center' }}
              onFocus={e => !nameError && (e.target.style.borderColor = '#2563eb')}
              onBlur={e => !nameError && (e.target.style.borderColor = '#e4e4e7')}
              onKeyDown={e => e.key === 'Enter' && handleDuplicate()}
            />
            {nameError && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{nameError}</p>}
          </div>

          {/* Copy allocations option */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: saving ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={copyAllocs}
                onChange={e => setCopyAllocs(e.target.checked)}
                disabled={saving || allocatedCount === 0}
                style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: allocatedCount === 0 ? '#a1a1aa' : '#09090b' }}>
                  Copy current allocations
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 2, lineHeight: 1.4 }}>
                  {allocatedCount === 0
                    ? 'No allocated slots in this rack.'
                    : `New rack will start with the same ${allocatedCount} brand allocation${allocatedCount !== 1 ? 's' : ''} in their matching slots.`}
                </div>
              </div>
            </label>
          </div>

          {/* Warning when copy is enabled */}
          {copyAllocs && (
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <AlertTriangle size={12} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: '#7c2d12', margin: 0, lineHeight: 1.5 }}>
                Brands already allocated to another rack of the same type cannot be duplicated (uniqueness rule). Those slots will be left empty in the new rack.
              </p>
            </div>
          )}

          {/* Progress */}
          {saving && progress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', marginTop: 8 }}>
              <div style={{ width: 12, height: 12, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl-spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>{progress}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: saving ? 'default' : 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500, opacity: saving ? 0.5 : 1 }}>
            Cancel
          </button>
          <button onClick={handleDuplicate} disabled={saving}
            style={{ padding: '8px 24px', background: '#09090b', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: saving ? 0.7 : 1, minWidth: 120, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving
              ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pl-spin 0.8s linear infinite' }} /> Creating…</>
              : <><Copy size={13} /> Duplicate</>}
          </button>
        </div>
      </div>
    </div>
  )
}
