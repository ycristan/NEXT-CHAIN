import { useEffect, useRef, useState } from 'react'
import { Check, X, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

// ── Types ───────────────────────────────────────────────────────
interface AvailableBrand {
  id: string
  brand_code: string
  brand_name: string
}

export interface ContextMenuTarget {
  slotId: string
  binAddress: string
  currentBrandId: string | null
  currentBrandCode: string | null
  currentBrandName: string | null
  currentLightAddress: string | null
  rackId: string
  rackTypeId: string | null
  x: number
  y: number
}

interface Props {
  target: ContextMenuTarget
  onClose: () => void
  onSaved: () => void
}

const MENU_W   = 272
// Accounts for: header + light addr + brand + error banner + actions
const APPROX_H = 290

// ── Component ───────────────────────────────────────────────────
export function PLSlotContextMenu({ target, onClose, onSaved }: Props) {
  const { addToast } = useToast()
  const menuRef      = useRef<HTMLDivElement>(null)
  const lightRef     = useRef<HTMLInputElement>(null)
  const brandRef     = useRef<HTMLInputElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)

  const [brands, setBrands]               = useState<AvailableBrand[]>([])
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [search, setSearch]               = useState(target.currentBrandCode ?? '')
  const [selected, setSelected]           = useState<AvailableBrand | null>(
    target.currentBrandId
      ? { id: target.currentBrandId, brand_code: target.currentBrandCode!, brand_name: target.currentBrandName! }
      : null
  )
  // Dropdown closed on mount — opens only when user types or presses ArrowDown
  const [dropOpen,       setDropOpen]       = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [lightAddr, setLightAddr]           = useState(target.currentLightAddress ?? '')
  const [saving,  setSaving]                = useState(false)
  const [errorMsg, setErrorMsg]             = useState<string | null>(null)

  // ── Focus Light Address on mount ─────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => lightRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  // ── Fetch brands allowed for this rack (category-filtered) ──
  // Category validation is enforced at load time: only brands whose
  // category_id is in rack_allowed_categories are shown in the dropdown.
  useEffect(() => {
    void (async () => {
      const { data: catRows } = await supabase
        .from('rack_allowed_categories')
        .select('category_id')
        .eq('rack_id', target.rackId)

      const allowedCatIds = (catRows ?? []).map((r: { category_id: string }) => r.category_id)

      let q = supabase
        .from('brands')
        .select('id, brand_code, brand_name')
        .eq('is_active', true)
        .order('brand_name')

      if (allowedCatIds.length > 0) q = q.in('category_id', allowedCatIds)

      const { data } = await q
      setBrands((data ?? []) as AvailableBrand[])
      setLoadingBrands(false)
    })()
  }, [target.rackId])

  // ── Close on outside click ──────────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 80)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onMouseDown) }
  }, [onClose])

  // ── Esc: close dropdown first, then close modal ──────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (dropOpen) { setDropOpen(false); setHighlightedIdx(-1) }
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dropOpen])

  // ── Reset keyboard highlight when search changes ─────────────
  useEffect(() => { setHighlightedIdx(-1) }, [search])

  // ── Scroll highlighted item into view ────────────────────────
  useEffect(() => {
    if (highlightedIdx < 0 || !dropdownRef.current) return
    const items = dropdownRef.current.querySelectorAll<HTMLElement>('[data-brand-item]')
    items[highlightedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIdx])

  // ── Viewport-clamped position ────────────────────────────────
  const posX = Math.min(target.x, window.innerWidth  - MENU_W   - 8)
  const posY = Math.min(target.y, window.innerHeight - APPROX_H - 8)

  // ── Filtered + prioritized + natural-sorted brand list ───────
  // Priority: prefix matches first, then substring matches.
  // Within each group: natural/numeric sort on brand_code (5 < 51 < 512 < 1000).
  const visibleBrands = (() => {
    const byCode = (a: AvailableBrand, b: AvailableBrand) =>
      a.brand_code.localeCompare(b.brand_code, undefined, { numeric: true })

    const term = search.trim().toLowerCase()
    if (!term) return [...brands].sort(byCode).slice(0, 50)

    const prefix: AvailableBrand[] = []
    const contains: AvailableBrand[] = []
    for (const b of brands) {
      const codeL = b.brand_code.toLowerCase()
      const nameL = b.brand_name.toLowerCase()
      if (codeL.startsWith(term) || nameL.startsWith(term)) prefix.push(b)
      else if (codeL.includes(term) || nameL.includes(term)) contains.push(b)
    }
    return [...prefix.sort(byCode), ...contains.sort(byCode)].slice(0, 50)
  })()

  // ── Core save — explicit params avoid stale-state race ───────
  // Duplicate-in-same-rack-type validation: enforced by DB unique constraint
  // (ERRCODE 23505). Error shown inline so user can correct without closing.
  async function saveSlot(brandId: string | null, lightAddress: string) {
    setSaving(true)
    setErrorMsg(null)

    const addr = lightAddress.trim() || null
    const payload = {
      allocated_brand_id: brandId,
      light_address: addr,
      // Auto-activate light when an address is set; deactivate when cleared
      light_status: addr ? 'on' : 'off',
    }

    const { error } = await supabase
      .from('slots')
      .update(payload as Record<string, unknown>)
      .eq('id', target.slotId)

    setSaving(false)
    if (error) {
      const msg = error.code === '23505'
        ? `Brand already allocated in another slot of this rack type.`
        : error.message
      setErrorMsg(msg)
      addToast(msg, 'error')
      return
    }
    onSaved()  // triggers loadAll({ silent: true }) in PickingLine — no scroll jump
  }

  // Quick allocation: picking a brand immediately saves (no Confirm needed).
  // Brand id passed directly — avoids stale setSelected race.
  function pickBrand(b: AvailableBrand) {
    setSelected(b)
    setSearch(b.brand_code)
    setDropOpen(false)
    setHighlightedIdx(-1)
    void saveSlot(b.id, lightAddr)
  }

  function clearBrand() {
    setSelected(null)
    setSearch('')
    setDropOpen(false)
    setHighlightedIdx(-1)
  }

  // Confirm button — saves current selection (or clears) + current light address
  function handleSave() {
    void saveSlot(selected?.id ?? null, lightAddr)
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div
      ref={menuRef}
      data-pl-ctx="1"
      style={{
        position: 'fixed',
        left: posX,
        top: posY,
        zIndex: 200,
        width: MENU_W,
        background: '#18181b',
        border: '1px solid #3f3f46',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        color: '#fafafa',
        userSelect: 'none',
      }}
    >
      {/* Header — X excluded from Tab order (use Esc instead) */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: '#71717a', letterSpacing: '0.08em' }}>
          {target.binAddress}
        </span>
        <button
          onClick={onClose}
          tabIndex={-1}  // keep out of Tab sequence — Esc is the keyboard way to close
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', display: 'flex', padding: 2 }}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── 1. Light Address ─────────────────────────────────── */}
        {/* Tab stop 1 — auto-focused on mount */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#71717a', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Zap size={9} color="#fbbf24" /> Light Address
          </div>
          <input
            ref={lightRef}
            value={lightAddr}
            onChange={e => setLightAddr(e.target.value)}
            placeholder="e.g. 101"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#27272a', border: '1px solid #3f3f46',
              padding: '6px 8px', fontSize: 12, color: '#fafafa',
              outline: 'none', fontFamily: "'IBM Plex Mono', monospace",
            }}
            onFocus={e => { e.target.style.borderColor = '#60a5fa' }}
            onBlur={e => { e.target.style.borderColor = '#3f3f46' }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              }
              // Tab: natural browser behavior — moves focus to Brand input
            }}
          />
        </div>

        {/* ── 2. Brand search ──────────────────────────────────── */}
        {/* Tab stop 2 — keyboard-navigable dropdown */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#71717a', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
            Brand
          </div>

          {/* Selection pill — shown when brand is selected and dropdown is closed.
              Pill X button excluded from Tab order. */}
          {selected && !dropOpen && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#14532d', border: '1px solid #166534', padding: '5px 8px', marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: '#86efac', flexShrink: 0 }}>{selected.brand_code}</span>
                <span style={{ fontSize: 11, color: '#bbf7d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.brand_name}</span>
              </div>
              <button
                onClick={clearBrand}
                tabIndex={-1}  // skip in Tab sequence
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#86efac', padding: '0 0 0 6px', display: 'flex', flexShrink: 0 }}
              >
                <X size={11} />
              </button>
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#27272a', border: `1px solid ${dropOpen ? '#60a5fa' : '#3f3f46'}`, gap: 6, padding: '5px 8px' }}>
              <input
                ref={brandRef}
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setDropOpen(true)
                  if (!e.target.value) setSelected(null)
                }}
                onClick={() => setDropOpen(true)}
                placeholder={selected ? 'Change brand…' : 'Code or name…'}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#fafafa', minWidth: 0 }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    if (!dropOpen) setDropOpen(true)
                    setHighlightedIdx(prev => Math.min(prev + 1, visibleBrands.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightedIdx(prev => {
                      const next = prev - 1
                      if (next < 0) { setDropOpen(false); return -1 }
                      return next
                    })
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (dropOpen && highlightedIdx >= 0 && visibleBrands[highlightedIdx]) {
                      // Highlighted item: select it (and save immediately via pickBrand)
                      pickBrand(visibleBrands[highlightedIdx])
                    } else {
                      // No highlighted item or list closed: save current selection
                      handleSave()
                    }
                  } else if (e.key === 'Tab') {
                    // Close dropdown before focus leaves — natural Tab moves to Cancel
                    setDropOpen(false)
                    setHighlightedIdx(-1)
                  }
                }}
              />
            </div>

            {/* Dropdown — keyboard + mouse driven, items excluded from Tab order */}
            {dropOpen && (
              <div
                ref={dropdownRef}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 2px)',
                  left: 0, right: 0,
                  background: '#27272a',
                  border: '1px solid #60a5fa',
                  maxHeight: 180, overflowY: 'auto',
                  zIndex: 201,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                }}
              >
                {loadingBrands ? (
                  <div style={{ padding: '10px 12px', fontSize: 11, color: '#71717a' }}>Loading…</div>
                ) : visibleBrands.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 11, color: '#71717a' }}>No brands found</div>
                ) : visibleBrands.map((b, itemIdx) => {
                  const isHighlighted = highlightedIdx === itemIdx
                  const isSelected    = selected?.id === b.id
                  return (
                    <button
                      key={b.id}
                      data-brand-item=""
                      tabIndex={-1}  // navigated via ArrowDown/Up, not Tab
                      onMouseDown={e => { e.preventDefault(); pickBrand(b) }}
                      onMouseEnter={() => setHighlightedIdx(itemIdx)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: isHighlighted ? '#2563eb' : isSelected ? '#1d4ed8' : 'none',
                        border: 'none', borderBottom: '1px solid #3f3f46',
                        padding: '6px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'baseline', gap: 8,
                      }}
                    >
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: isHighlighted ? '#fff' : '#60a5fa', flexShrink: 0 }}>
                        {b.brand_code}
                      </span>
                      <span style={{ fontSize: 11, color: isHighlighted ? '#e0f2fe' : '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.brand_name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Inline validation error ──────────────────────────── */}
        {errorMsg && (
          <div style={{
            fontSize: 11, color: '#fca5a5',
            background: '#450a0a', border: '1px solid #dc2626',
            padding: '6px 8px', lineHeight: 1.4,
          }}>
            {errorMsg}
          </div>
        )}

        {/* ── Actions — Tab stop 3 (Cancel) and 4 (Confirm) ─── */}
        <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '7px 0', background: 'none', border: '1px solid #3f3f46', color: '#a1a1aa', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: '7px 0',
              background: saving ? '#1d4ed8' : '#2563eb',
              border: 'none', color: '#fff',
              fontSize: 11, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saving
              ? <><div style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pl-spin 0.7s linear infinite' }} /> Saving…</>
              : <><Check size={12} /> Confirm</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
