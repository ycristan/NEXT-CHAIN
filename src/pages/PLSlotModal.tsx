import { useEffect, useRef, useState } from 'react'
import {
  X, Search, Lightbulb, AlertTriangle, ArrowRightLeft, Trash2,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Tag, GitFork,
} from 'lucide-react'
import {
  type AllocatableBrand,
  getBrandsForAllocation,
  allocateBrandToSlot,
  deallocateSlot,
  moveBrandToSlot,
  setSlotExpansion,
  resetSlot,
} from '@/lib/pickingLineService'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────
export interface ModalSlot {
  id: string
  bin_address: string
  allocated_brand_id: string | null
  slot_state: 'empty' | 'brand_allocated' | 'expansion_reserved'
  expansion_direction: 'above' | 'below' | 'left' | 'right' | null
  light_address: string | null
  light_status: 'off' | 'on' | 'blink'
  brand: { brand_code: string; brand_name: string; bpu: number | null } | null
}

type OccupationType = 'brand' | 'expansion'
type Direction     = 'above' | 'below' | 'left' | 'right'

interface Props {
  slot: ModalSlot
  rackId: string
  rackTypeId: string | null
  rackTypeName: string | null
  onClose: () => void
  onSaved: () => void
}

// ── Direction config ───────────────────────────────────────────
const DIRECTIONS: { value: Direction; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'above', label: 'Use slot above',  Icon: ArrowUp    },
  { value: 'below', label: 'Use slot below',  Icon: ArrowDown  },
  { value: 'left',  label: 'Use slot to left',  Icon: ArrowLeft  },
  { value: 'right', label: 'Use slot to right', Icon: ArrowRight },
]

// ── Component ──────────────────────────────────────────────────
export function PLSlotModal({ slot, rackId, rackTypeId, rackTypeName, onClose, onSaved }: Props) {
  const searchRef = useRef<HTMLInputElement>(null)

  // Occupation type
  const initType: OccupationType = slot.slot_state === 'expansion_reserved' ? 'expansion' : 'brand'
  const [occupationType, setOccupationType] = useState<OccupationType>(initType)

  // Brand mode state
  const [brands, setBrands]             = useState<AllocatableBrand[]>([])
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [search, setSearch]             = useState('')
  const [selectedBrand, setSelectedBrand] = useState<AllocatableBrand | null>(null)

  // Expansion mode state
  const [selectedDir, setSelectedDir] = useState<Direction | null>(slot.expansion_direction ?? null)

  // Shared
  const [lightAddress, setLightAddress] = useState(slot.light_address ?? '')
  const [lightStatus, setLightStatus]   = useState<'on' | 'off'>(
    slot.light_status === 'on' || slot.light_status === 'blink' ? 'on' : 'off'
  )
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // ── Load brands ────────────────────────────────────────────
  useEffect(() => {
    void loadBrands()
    setTimeout(() => { if (occupationType === 'brand') searchRef.current?.focus() }, 80)
  }, [])

  async function loadBrands() {
    setLoadingBrands(true)
    const { data } = await getBrandsForAllocation(rackId)
    if (data) {
      setBrands(data)
      if (slot.allocated_brand_id) {
        setSelectedBrand(data.find(b => b.id === slot.allocated_brand_id) ?? null)
      }
    }
    setLoadingBrands(false)
  }

  // ── Derived — prefix-priority + natural numeric sort ─────────
  // Priority: brand_code/name prefix matches first, then substring matches.
  // Within each group: natural/numeric sort on brand_code (5 < 51 < 512 < 1000).
  const term = search.trim().toLowerCase()
  const byCode = (a: AllocatableBrand, b: AllocatableBrand) =>
    a.brand_code.localeCompare(b.brand_code, undefined, { numeric: true })

  const filtered = (() => {
    if (!term) return [...brands].sort(byCode)
    const prefix: AllocatableBrand[] = []
    const contains: AllocatableBrand[] = []
    for (const b of brands) {
      const codeL = b.brand_code.toLowerCase()
      const nameL = b.brand_name.toLowerCase()
      if (codeL.startsWith(term) || nameL.startsWith(term)) prefix.push(b)
      else if (codeL.includes(term) || nameL.includes(term)) contains.push(b)
    }
    return [...prefix.sort(byCode), ...contains.sort(byCode)]
  })()

  const isMoveScenario =
    selectedBrand !== null &&
    selectedBrand.isAllocatedInType &&
    selectedBrand.id !== slot.allocated_brand_id

  const brandChanged = selectedBrand?.id !== slot.allocated_brand_id

  // Was expansion, switching to brand
  const wasExpansion = slot.slot_state === 'expansion_reserved' && occupationType === 'brand'

  // ── Save ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setError(null)

    if (occupationType === 'expansion') {
      if (!selectedDir) { setError('Select a flow direction.'); setSaving(false); return }
      const { error } = await setSlotExpansion(slot.id, selectedDir)
      if (error) { setError(error); setSaving(false); return }

    } else {
      // Brand mode — if slot was expansion_reserved, reset first
      if (slot.slot_state === 'expansion_reserved') {
        const { error } = await resetSlot(slot.id)
        if (error) { setError(error); setSaving(false); return }
      }

      if (brandChanged) {
        if (!selectedBrand) {
          const { error } = await deallocateSlot(slot.id)
          if (error) { setError(error); setSaving(false); return }
        } else if (isMoveScenario && rackTypeId) {
          const { error } = await moveBrandToSlot(slot.id, selectedBrand.id, rackTypeId)
          if (error) { setError(error); setSaving(false); return }
        } else {
          const { error } = await allocateBrandToSlot(slot.id, selectedBrand.id)
          if (error) { setError(error); setSaving(false); return }
        }
      }
    }

    // Always sync light address + status
    // If address is cleared, force status to 'off' regardless of toggle.
    const newLight  = lightAddress.trim() || null
    const newStatus = newLight ? lightStatus : 'off'
    const { error: lightErr } = await supabase
      .from('slots')
      .update({ light_address: newLight, light_status: newStatus })
      .eq('id', slot.id)
    if (lightErr) { setError(lightErr.message); setSaving(false); return }

    onSaved()
  }

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 2 }}>
              Slot Allocation
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 800, color: '#09090b', letterSpacing: '0.04em', lineHeight: 1 }}>
              {slot.bin_address}
            </div>
            {rackTypeName && (
              <div style={{ fontSize: 11, color: '#71717a', marginTop: 3 }}>
                Type: <strong>{rackTypeName}</strong>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Occupation type toggle ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Occupation Type
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e4e4e7' }}>
              {([
                { value: 'brand' as OccupationType,     label: 'Allocate Brand',     Icon: Tag },
                { value: 'expansion' as OccupationType, label: 'Expansion Flow',     Icon: GitFork },
              ] as const).map(({ value, label, Icon }) => {
                const isActive = occupationType === value
                return (
                  <button key={value} onClick={() => { setOccupationType(value); setError(null) }}
                    style={{
                      flex: 1, padding: '9px 12px', border: 'none',
                      borderRight: value === 'brand' ? '1px solid #e4e4e7' : 'none',
                      background: isActive ? '#09090b' : '#fafafa',
                      color: isActive ? '#fff' : '#71717a',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'background 0.15s',
                    }}>
                    <Icon size={13} />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Warning: switching from expansion to brand */}
            {wasExpansion && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fcd34d', marginTop: 8 }}>
                <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                  This slot is currently set as <strong>Expansion Reserved</strong>. Saving in Brand mode will reset it.
                </span>
              </div>
            )}
          </div>

          {/* ── Light Address + Status Toggle (always shown) ── */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              <Lightbulb size={12} /> Light Address
            </label>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
              {/* Address input */}
              <input
                type="text"
                value={lightAddress}
                onChange={e => {
                  setLightAddress(e.target.value)
                  // Auto-activate when user types an address (can be overridden by toggle)
                  if (e.target.value.trim()) setLightStatus('on')
                  else setLightStatus('off')
                }}
                placeholder="e.g. 42"
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #e4e4e7', fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", outline: 'none' }}
              />

              {/* ON / OFF rectangular toggle — disabled (muted) when no address */}
              <div
                style={{
                  display: 'flex',
                  border: '1px solid #e4e4e7',
                  overflow: 'hidden',
                  flexShrink: 0,
                  opacity: lightAddress.trim() ? 1 : 0.38,
                  pointerEvents: lightAddress.trim() ? 'auto' : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => setLightStatus('on')}
                  style={{
                    width: 44, padding: '0 4px',
                    border: 'none',
                    borderRight: '1px solid #e4e4e7',
                    background: lightStatus === 'on' ? '#22c55e' : '#fafafa',
                    color: lightStatus === 'on' ? '#fff' : '#a1a1aa',
                    fontSize: 11, fontWeight: 800,
                    cursor: 'pointer', letterSpacing: '0.08em',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => setLightStatus('off')}
                  style={{
                    width: 44, padding: '0 4px',
                    border: 'none',
                    background: lightStatus === 'off' ? '#e4e4e7' : '#fafafa',
                    color: lightStatus === 'off' ? '#52525b' : '#a1a1aa',
                    fontSize: 11, fontWeight: 800,
                    cursor: 'pointer', letterSpacing: '0.08em',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  OFF
                </button>
              </div>
            </div>
          </div>

          {/* ── BRAND MODE ── */}
          {occupationType === 'brand' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Brand
              </label>

              {/* Selected brand chip */}
              {selectedBrand && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#f0fdf4', border: '1px solid #86efac', marginBottom: 8 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 800, color: '#09090b' }}>{selectedBrand.brand_code}</span>
                  <span style={{ fontSize: 12, color: '#27272a', fontWeight: 600, flex: 1 }}>{selectedBrand.brand_name}</span>
                  {selectedBrand.bpu != null && <span style={{ fontSize: 11, color: '#71717a' }}>×{selectedBrand.bpu}</span>}
                  <button onClick={() => setSelectedBrand(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex', padding: 2 }}>
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Move warning */}
              {isMoveScenario && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: 8 }}>
                  <ArrowRightLeft size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                    Currently at <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{selectedBrand!.allocatedAt}</strong>. Saving will <strong>move it</strong> to {slot.bin_address}.
                  </span>
                </div>
              )}

              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or code…"
                  style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #e4e4e7', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Brand list */}
              <div style={{ border: '1px solid #e4e4e7', overflowY: 'auto', flex: 1, minHeight: 180, maxHeight: 260 }}>
                {loadingBrands ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: '#a1a1aa', fontSize: 12 }}>Loading brands…</div>
                ) : filtered.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: '#a1a1aa', fontSize: 12 }}>No brands found</div>
                ) : filtered.map(b => {
                  const isSelected  = b.id === selectedBrand?.id
                  const isCurrent   = b.id === slot.allocated_brand_id
                  const isElsewhere = b.isAllocatedInType && !isCurrent
                  return (
                    <button key={b.id} onClick={() => setSelectedBrand(isSelected ? null : b)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
                        borderBottom: '1px solid #f4f4f5',
                        borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                        background: isSelected ? '#eff6ff' : isElsewhere ? '#fffbeb' : '#fff',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isElsewhere ? '#fef9c3' : '#f4f4f5' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? '#eff6ff' : isElsewhere ? '#fffbeb' : '#fff' }}
                    >
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 800, color: isSelected ? '#2563eb' : '#09090b', minWidth: 48, flexShrink: 0 }}>
                        {b.brand_code}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: isElsewhere ? '#92400e' : '#27272a', fontStyle: isElsewhere ? 'italic' : 'normal', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.brand_name}
                      </span>
                      {b.bpu != null && <span style={{ fontSize: 10, color: '#a1a1aa', flexShrink: 0 }}>×{b.bpu}</span>}
                      {isCurrent && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: '#dcfce7', color: '#16a34a', flexShrink: 0 }}>CURRENT</span>
                      )}
                      {isElsewhere && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: '#fef3c7', color: '#d97706', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          → {b.allocatedAt}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── EXPANSION MODE ── */}
          {occupationType === 'expansion' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Flow Direction
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {DIRECTIONS.map(({ value, label, Icon }) => {
                  const isActive = selectedDir === value
                  return (
                    <button key={value} onClick={() => setSelectedDir(value)}
                      style={{
                        padding: '14px 12px', border: `2px solid ${isActive ? '#7c3aed' : '#e4e4e7'}`,
                        background: isActive ? '#faf5ff' : '#fafafa',
                        color: isActive ? '#6d28d9' : '#52525b',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        transition: 'all 0.15s',
                      }}>
                      <Icon size={20} />
                      {label}
                    </button>
                  )
                })}
              </div>
              {selectedDir && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#faf5ff', border: '1px solid #ddd6fe', fontSize: 12, color: '#6d28d9', fontWeight: 600 }}>
                  This slot will direct picking flow to the slot {selectedDir === 'above' ? 'above' : selectedDir === 'below' ? 'below' : `to the ${selectedDir}`}.
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fca5a5' }}>
              <AlertTriangle size={13} style={{ color: '#dc2626', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Clear slot button */}
          {(slot.allocated_brand_id || slot.slot_state === 'expansion_reserved') && (
            <button
              onClick={async () => {
                setSaving(true); setError(null)
                const { error } = await resetSlot(slot.id)
                if (error) { setError(error); setSaving(false); return }
                await supabase.from('slots').update({ light_address: null, light_status: 'off' }).eq('id', slot.id)
                onSaved()
              }}
              disabled={saving} title="Reset this slot to empty"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'none', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
              <Trash2 size={11} /> Clear Slot
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '8px 20px', background: '#09090b', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, minWidth: 80 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
