import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ShieldCheck, AlertTriangle, Eye, EyeOff, Search, CheckCircle2, Printer } from 'lucide-react'
import {
  getReplanningSlots,
  getOfficialBrandsByRackType,
  getAllDraftBrandIdsForRackType,
  type OfficialBrandItem,
} from '@/lib/pickingLineService'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { PLReplanningSlotModal, type ReplanningModalSlot } from './PLReplanningSlotModal'
import { PLPrintView } from './PLPrintView'

// ── Constants (mirror PickingLine) ─────────────────────────────
const CELL_W      = 160
const CELL_GAP    = 4
const ROW_LABEL_W = 40
const GRID_PAD    = 20

// ── Types ──────────────────────────────────────────────────────
interface ViewRack {
  id: string
  name: string
  rack_type_id: string | null
  columns: number
  rows: number
  rack_type: { id: string; name: string } | null
  allowed_categories: string[]
}

interface OfficialSlot {
  bin_address: string
  allocated_brand_id: string | null
  slot_state: 'empty' | 'brand_allocated' | 'expansion_reserved'
  expansion_direction: 'above' | 'below' | 'left' | 'right' | null
  brand: { brand_code: string; brand_name: string } | null
}

interface ReplanningSlot {
  id: string
  rack_id: string
  column_letter: string
  row_number: number
  bin_address: string
  allocated_brand_id: string | null
  slot_state: 'empty' | 'brand_allocated' | 'expansion_reserved'
  expansion_direction: 'above' | 'below' | 'left' | 'right' | null
  light_address: string | null
  light_status: 'off' | 'on' | 'blink'
  brand: { brand_code: string; brand_name: string; bpu: number | null } | null
}

interface Props {
  rack: ViewRack
  officialSlots: OfficialSlot[]   // still used for hover reference card
  onClose: () => void
  onPublished: () => void
}

const DIR_ARROW: Record<string, string> = { above: '↑', below: '↓', left: '←', right: '→' }
const DIR_LABEL: Record<string, string> = { above: 'USE ABOVE', below: 'USE BELOW', left: 'USE LEFT', right: 'USE RIGHT' }

// ── Component ──────────────────────────────────────────────────
export function PLReplanningView({ rack, officialSlots, onClose, onPublished }: Props) {
  const { addToast } = useToast()
  const [draftSlots, setDraftSlots]         = useState<ReplanningSlot[]>([])
  const [loading, setLoading]               = useState(true)
  const [slotModal, setSlotModal]           = useState<ReplanningSlot | null>(null)
  const [hoverRef, setHoverRef]             = useState<{ slot: ReplanningSlot; rect: DOMRect } | null>(null)

  // ── Print state ─────────────────────────────────────────────
  const [printOpen, setPrintOpen]           = useState(false)

  // ── Publish (authorize) state ───────────────────────────────
  const [publishModal, setPublishModal]     = useState(false)
  const [publishPwd, setPublishPwd]         = useState('')
  useEffect(() => {
    return () => { setPublishPwd('') }
  }, [])
  const [showPwd, setShowPwd]               = useState(false)
  const [publishing, setPublishing]         = useState(false)
  const [publishError, setPublishError]     = useState<string | null>(null)
  const pwdRef                              = useRef<HTMLInputElement>(null)

  // ── Checklist state ─────────────────────────────────────────
  // All brand-allocated slots across the entire rack type
  const [typewideBrands, setTypewideBrands] = useState<OfficialBrandItem[]>([])
  // Brand IDs placed in ANY active draft of the same rack type
  const [allDraftBrandIds, setAllDraftBrandIds] = useState<Set<string>>(new Set())
  const [checklistSearch, setChecklistSearch]   = useState('')

  // Hover reference: official slot map for THIS rack only
  const officialMap = useMemo(() => {
    const m = new Map<string, OfficialSlot>()
    for (const s of officialSlots) m.set(s.bin_address, s)
    return m
  }, [officialSlots])

  // ── Load everything ─────────────────────────────────────────
  useEffect(() => {
    void loadDraft()
    void loadChecklist()
  }, [])

  async function loadDraft() {
    setLoading(true)
    const { data, error } = await getReplanningSlots(rack.id)
    if (error) {
      addToast(`Error loading draft: ${error}`, 'error')
    } else {
      setDraftSlots((data ?? []) as ReplanningSlot[])
    }
    setLoading(false)
  }

  async function loadChecklist() {
    if (!rack.rack_type_id) return
    const [{ data: brands }, draftIds] = await Promise.all([
      getOfficialBrandsByRackType(rack.rack_type_id),
      getAllDraftBrandIdsForRackType(rack.rack_type_id),
    ])
    setTypewideBrands(brands ?? [])
    setAllDraftBrandIds(draftIds)
  }

  // ── Publish ──────────────────────────────────────────────────
  async function handlePublish() {
    if (!publishPwd.trim()) { setPublishError('Enter your password.'); return }
    setPublishing(true)
    setPublishError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setPublishError('Could not retrieve current user.'); setPublishing(false); return }

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: publishPwd,
    })
    setPublishPwd('')  // clear immediately after auth attempt, regardless of outcome
    if (authErr) {
      setPublishError('Incorrect password. Authorization denied.')
      setPublishing(false)
      return
    }

    const { error: rpcErr } = await supabase.rpc('publish_replanning', { p_rack_id: rack.id })
    if (rpcErr) {
      setPublishError(`Publish failed: ${rpcErr.message}`)
      setPublishing(false)
      return
    }

    addToast(`Rack ${rack.name} replanning published successfully.`, 'success')
    onPublished()
  }

  // ── Derived grid data ────────────────────────────────────────
  const slotMap = useMemo(() => {
    const m = new Map<string, ReplanningSlot>()
    for (const s of draftSlots) m.set(`${s.column_letter}-${s.row_number}`, s)
    return m
  }, [draftSlots])

  const colLetters     = Array.from({ length: rack.columns }, (_, i) => String.fromCharCode(65 + i))
  const rowNums        = Array.from({ length: rack.rows },    (_, i) => i + 1)
  const rackW          = ROW_LABEL_W + rack.columns * CELL_W + (rack.columns - 1) * CELL_GAP + GRID_PAD * 2
  const allocatedCount = draftSlots.filter(s => s.allocated_brand_id).length

  // ── Checklist computed ───────────────────────────────────────
  // Draft bin map for THIS rack only (to show "→ BIN" badge)
  const draftBrandMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of draftSlots) {
      if (s.allocated_brand_id) m.set(s.allocated_brand_id, s.bin_address)
    }
    return m
  }, [draftSlots])

  const filteredTypewideBrands = useMemo(() => {
    if (!checklistSearch.trim()) return typewideBrands
    const q = checklistSearch.toLowerCase()
    return typewideBrands.filter(
      b =>
        b.brand_code.toLowerCase().includes(q) ||
        b.brand_name.toLowerCase().includes(q) ||
        b.rack_name.toLowerCase().includes(q),
    )
  }, [typewideBrands, checklistSearch])

  const struckCount = useMemo(
    () => typewideBrands.filter(b => allDraftBrandIds.has(b.brand_id)).length,
    [typewideBrands, allDraftBrandIds],
  )

  const progressPct = typewideBrands.length > 0
    ? Math.round((struckCount / typewideBrands.length) * 100)
    : 0

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fafaf9' }}>

      {/* ── Amber draft header ── */}
      <div style={{ background: '#fefce8', borderBottom: '2px solid #fde047', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'none', border: '1px solid #fcd34d', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={13} /> Back to Live View
        </button>
        <div style={{ height: 20, width: 1, background: '#fde047' }} />
        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', background: '#fef08a', color: '#713f12', letterSpacing: '0.12em', border: '1px solid #fde047' }}>
          DRAFT MODE
        </span>
        <div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 800, color: '#1c1917' }}>{rack.name}</span>
          {rack.rack_type && (
            <span style={{ fontSize: 12, color: '#57534e', marginLeft: 8 }}>{rack.rack_type.name}</span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#78716c' }}>
            {allocatedCount} / {draftSlots.length} allocated
          </span>
          <button
            onClick={() => setPrintOpen(true)}
            disabled={draftSlots.length === 0}
            title="Print Draft Layout (Grid)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'none', border: '1px solid #fcd34d', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: draftSlots.length === 0 ? 'default' : 'pointer', opacity: draftSlots.length === 0 ? 0.4 : 1 }}>
            <Printer size={13} /> Print Draft
          </button>
          <button
            onClick={() => {
              setPublishPwd('')
              setPublishError(null)
              setShowPwd(false)
              setPublishModal(true)
              setTimeout(() => pwdRef.current?.focus(), 80)
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#16a34a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
            <ShieldCheck size={13} /> Authorize & Publish
          </button>
        </div>
      </div>

      {/* Info bar */}
      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fef08a', padding: '5px 20px', fontSize: 11, color: '#92400e', flexShrink: 0 }}>
        Changes here are saved to the <strong>draft only</strong> — the live rack is not affected.
        Hover any slot to see its current official state.
      </div>

      {/* ── Main content: grid + checklist panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Scrollable grid area */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 20, height: 20, border: '2px solid #d97706', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl-spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <div style={{ width: rackW }}>
              <div style={{ border: '2px solid #fde047', borderTop: '4px solid #f59e0b', background: '#fff' }}>

                {/* Rack mini-header */}
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #fef08a', background: '#fefce8', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 800, color: '#92400e' }}>{rack.name}</span>
                  <span style={{ fontSize: 11, color: '#78716c' }}>{rack.columns} col × {rack.rows} row</span>
                  {rack.allowed_categories.map(cat => (
                    <span key={cat} style={{ background: '#fef9c3', color: '#854d0e', fontSize: 10, fontWeight: 600, padding: '2px 6px', border: '1px solid #fde047' }}>{cat}</span>
                  ))}
                </div>

                {/* Slot grid */}
                <div style={{ padding: `16px ${GRID_PAD}px` }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `${ROW_LABEL_W}px repeat(${rack.columns}, ${CELL_W}px)`,
                    gridTemplateRows: `32px repeat(${rack.rows}, 80px)`,
                    gap: CELL_GAP,
                  }}>
                    <div />
                    {colLetters.map(letter => (
                      <div key={`h-${letter}`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#71717a', letterSpacing: '0.08em' }}>
                        {letter}
                      </div>
                    ))}

                    {rowNums.flatMap(row => [
                      <div key={`rl-${row}`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, fontSize: 11, fontWeight: 700, color: '#a1a1aa' }}>
                        {String(row).padStart(2, '0')}
                      </div>,

                      ...colLetters.map(letter => {
                        const slot        = slotMap.get(`${letter}-${row}`)
                        const brand       = slot?.brand ?? null
                        const isAllocated = !!brand
                        const isExpansion = slot?.slot_state === 'expansion_reserved'
                        const dir         = slot?.expansion_direction ?? null
                        const lightOn     = slot?.light_status === 'on' || slot?.light_status === 'blink'
                        const isBlink     = slot?.light_status === 'blink'

                        return (
                          <div key={`${letter}-${row}`}
                            onClick={() => slot && setSlotModal(slot)}
                            onMouseEnter={e => {
                              if (slot) {
                                setHoverRef({ slot, rect: e.currentTarget.getBoundingClientRect() })
                                e.currentTarget.style.filter = 'brightness(0.96)'
                              }
                            }}
                            onMouseLeave={e => {
                              setHoverRef(null)
                              e.currentTarget.style.filter = ''
                            }}
                            style={{
                              position: 'relative',
                              border: isExpansion
                                ? '2px dashed #a78bfa'
                                : `1px solid ${isAllocated ? '#86efac' : '#d4d4d8'}`,
                              background: isExpansion ? '#faf5ff' : isAllocated ? '#f0fdf4' : '#f9fafb',
                              borderRadius: 3,
                              overflow: 'hidden',
                              cursor: slot ? 'pointer' : 'default',
                            }}
                          >
                            {isExpansion ? (
                              <>
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                  <span style={{ fontSize: 22, lineHeight: 1, color: '#7c3aed' }}>{dir ? DIR_ARROW[dir] : '⇿'}</span>
                                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6d28d9', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{dir ? DIR_LABEL[dir] : 'EXPANSION'}</span>
                                </div>
                                <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em', lineHeight: 1 }}>
                                  {slot.bin_address}
                                </span>
                              </>
                            ) : (
                              <>
                                {brand && (
                                  <span style={{ position: 'absolute', top: 5, left: 6, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#09090b', lineHeight: 1, maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {brand.brand_code}
                                  </span>
                                )}
                                {brand?.bpu != null && (
                                  <span style={{ position: 'absolute', top: 5, right: 6, fontSize: 10, color: '#52525b', fontWeight: 600, lineHeight: 1 }}>
                                    ×{brand.bpu}
                                  </span>
                                )}
                                {brand && (
                                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 20px)', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#27272a', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                                    {brand.brand_name}
                                  </div>
                                )}
                                <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: isAllocated ? '#16a34a' : '#a1a1aa', letterSpacing: '0.04em', lineHeight: 1 }}>
                                  {slot?.bin_address ?? ''}
                                </span>
                                {slot && (
                                  <span style={{ position: 'absolute', bottom: 4, right: 6, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, background: lightOn ? '#22c55e' : '#e4e4e7', color: lightOn ? '#fff' : '#a1a1aa', border: lightOn ? '1px solid #16a34a' : '1px solid #d4d4d8', animation: isBlink ? 'pl-blink 1s ease-in-out infinite' : 'none', lineHeight: 1, userSelect: 'none' }}>
                                    {slot.light_address ?? '·'}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )
                      }),
                    ])}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Official Items checklist panel ── */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e7e5e4', background: '#fff', overflow: 'hidden' }}>

          {/* Panel header */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f5f5f4', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1c1917', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {rack.rack_type?.name ?? 'Official'} Items
              </span>
              <span style={{ fontSize: 11, color: '#78716c', fontFamily: "'IBM Plex Mono', monospace" }}>
                {struckCount}<span style={{ color: '#d4d4d8', margin: '0 2px' }}>/</span>{typewideBrands.length}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#a8a29e', marginBottom: 8 }}>
              All racks of this type · any active draft
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: '#f5f5f4', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                background: progressPct === 100 ? '#16a34a' : '#f59e0b',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 3, textAlign: 'right' }}>
              {progressPct}% placed in draft
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f4', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid #e4e4e7', background: '#fafaf9' }}>
              <Search size={12} color="#a1a1aa" />
              <input
                value={checklistSearch}
                onChange={e => setChecklistSearch(e.target.value)}
                placeholder="Code, name, or rack…"
                style={{ flex: 1, border: 'none', background: 'none', fontSize: 12, outline: 'none', color: '#1c1917' }}
              />
            </div>
          </div>

          {/* Brand list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredTypewideBrands.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: '#a8a29e', textAlign: 'center', fontStyle: 'italic' }}>
                {checklistSearch ? 'No matches' : 'No items found'}
              </div>
            ) : (
              filteredTypewideBrands.map((b, idx) => {
                const isStruck     = allDraftBrandIds.has(b.brand_id)
                const inThisDraft  = draftBrandMap.has(b.brand_id)
                const draftBin     = draftBrandMap.get(b.brand_id)
                const isOtherDraft = isStruck && !inThisDraft

                return (
                  <div key={`${b.brand_id}-${idx}`} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '7px 12px',
                    borderBottom: '1px solid #fafaf9',
                    background: isStruck ? '#f0fdf4' : '#fff',
                    transition: 'background 0.15s',
                  }}>
                    {/* Status indicator */}
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      {isStruck
                        ? <CheckCircle2 size={13} color="#16a34a" />
                        : <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid #d4d4d8' }} />
                      }
                    </div>

                    {/* Brand info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: code + draft badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          fontWeight: 800,
                          color: isStruck ? '#15803d' : '#1c1917',
                          textDecoration: isStruck ? 'line-through' : 'none',
                          textDecorationColor: '#16a34a',
                        }}>
                          {b.brand_code}
                        </span>
                        {inThisDraft && draftBin && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: '#fef08a', color: '#713f12', border: '1px solid #fde047', letterSpacing: '0.06em', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                            → {draftBin}
                          </span>
                        )}
                        {isOtherDraft && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: '#f5f5f4', color: '#78716c', border: '1px solid #e4e4e7', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                            OTHER DRAFT
                          </span>
                        )}
                      </div>

                      {/* Row 2: brand name */}
                      <div style={{
                        fontSize: 11,
                        color: isStruck ? '#86efac' : '#57534e',
                        textDecoration: isStruck ? 'line-through' : 'none',
                        textDecorationColor: '#86efac',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 1,
                      }}>
                        {b.brand_name}
                      </div>

                      {/* Row 3: official rack label */}
                      <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: '#a8a29e', marginTop: 2 }}>
                        <span style={{ color: '#d4d4d8' }}>Rack</span> {b.rack_name}
                        <span style={{ color: '#d4d4d8', margin: '0 3px' }}>·</span>
                        {b.bin_address}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Hover reference card ── */}
      {hoverRef && (() => {
        const official = officialMap.get(hoverRef.slot.bin_address)
        const rect = hoverRef.rect
        const showAbove = rect.top > 160
        return (
          <div style={{
            position: 'fixed',
            top: showAbove ? rect.top - 8 : rect.bottom + 8,
            left: Math.min(rect.left, window.innerWidth - 270),
            transform: showAbove ? 'translateY(-100%)' : 'none',
            zIndex: 100,
            background: '#1c1917',
            color: '#e7e5e4',
            padding: '8px 12px',
            minWidth: 220,
            pointerEvents: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            lineHeight: 1.5,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#78716c', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
              Current Official · {hoverRef.slot.bin_address}
            </div>
            {official?.brand ? (
              <div style={{ fontSize: 12 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#fbbf24' }}>{official.brand.brand_code}</span>
                <span style={{ color: '#d4d4d8', marginLeft: 6 }}>{official.brand.brand_name}</span>
              </div>
            ) : official?.slot_state === 'expansion_reserved' ? (
              <div style={{ fontSize: 12, color: '#a78bfa', fontStyle: 'italic' }}>
                Expansion {official.expansion_direction ? `(${official.expansion_direction})` : 'Reserved'}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#78716c', fontStyle: 'italic' }}>Empty</div>
            )}
          </div>
        )
      })()}

      {/* ── Slot modal ── */}
      {slotModal && (
        <PLReplanningSlotModal
          slot={slotModal as ReplanningModalSlot}
          rackId={rack.id}
          rackTypeName={rack.rack_type?.name ?? null}
          onClose={() => setSlotModal(null)}
          onSaved={() => { setSlotModal(null); void loadDraft() }}
        />
      )}

      {/* ── Authorize & Publish modal ── */}
      {publishModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 440, background: '#fff', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>

            <div style={{ background: '#14532d', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={16} color="#86efac" />
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Authorize Replanning — Rack {rack.name}
              </span>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 20 }}>
                <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
                  This will <strong>permanently replace</strong> the live layout of Rack <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rack.name}</strong> with the current draft.
                  Brands moved in the draft will be relocated from their current racks. <strong>This action cannot be undone.</strong>
                </span>
              </div>

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Admin Password
              </label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e4e4e7', marginBottom: 4 }}>
                <input
                  ref={pwdRef}
                  type={showPwd ? 'text' : 'password'}
                  value={publishPwd}
                  onChange={e => { setPublishPwd(e.target.value); setPublishError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') void handlePublish() }}
                  placeholder="Enter your password…"
                  style={{ flex: 1, padding: '9px 12px', border: 'none', fontSize: 13, outline: 'none' }}
                />
                <button
                  onClick={() => setShowPwd(v => !v)}
                  style={{ padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex', alignItems: 'center', height: '100%' }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {publishError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 4 }}>
                  <AlertTriangle size={12} style={{ color: '#dc2626', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#dc2626' }}>{publishError}</span>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setPublishModal(false); setPublishPwd('') }}
                disabled={publishing}
                style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', fontSize: 13, fontWeight: 500, cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.5 : 1 }}>
                Cancel
              </button>
              <button
                onClick={() => void handlePublish()}
                disabled={publishing || !publishPwd.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: publishing ? '#15803d' : '#16a34a', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (publishing || !publishPwd.trim()) ? 'default' : 'pointer', opacity: !publishPwd.trim() ? 0.6 : 1, minWidth: 160 }}>
                <ShieldCheck size={13} />
                {publishing ? 'Publishing…' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Draft print view ── */}
      {printOpen && (
        <PLPrintView
          rack={{
            id:         rack.id,
            name:       rack.name,
            columns:    rack.columns,
            rows:       rack.rows,
            rack_type:  rack.rack_type ? { name: rack.rack_type.name } : null,
            slot_count: draftSlots.length,
          }}
          slots={draftSlots.map(s => ({
            id:                 s.id,
            bin_address:        s.bin_address,
            column_letter:      s.column_letter,
            row_number:         s.row_number,
            allocated_brand_id: s.allocated_brand_id,
            slot_state:         s.slot_state,
            expansion_direction: s.expansion_direction,
            light_address:      s.light_address,
            brand: s.brand
              ? { brand_code: s.brand.brand_code, brand_name: s.brand.brand_name, bpu: s.brand.bpu, category: null, category1: null }
              : null,
          }))}
          mode="grid"
          isDraft={true}
          onClose={() => setPrintOpen(false)}
        />
      )}

      <style>{`
        @keyframes pl-spin  { to { transform: rotate(360deg); } }
        @keyframes pl-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  )
}
