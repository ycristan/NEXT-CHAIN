import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Lock, Trash2, AlertTriangle, Printer, List, LayoutGrid, FileText, FileSpreadsheet, Pencil, Copy, GripVertical } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PLRackForm } from './PLRackForm'
import { PLRackEditModal } from './PLRackEditModal'
import { PLRackDuplicateModal } from './PLRackDuplicateModal'
import { PLSlotModal, type ModalSlot } from './PLSlotModal'
import { PLPrintView, type PrintMode } from './PLPrintView'
import { exportRackLabels } from '@/lib/exportLabels'
import { getReplanningRackIds, startReplanning, discardReplanning } from '@/lib/pickingLineService'
import { PLReplanningView } from './PLReplanningView'
import { PLSlotImagePreview, type PreviewHandle } from './PLSlotImagePreview'
import { PLSlotContextMenu, type ContextMenuTarget } from './PLSlotContextMenu'
import { searchSlots } from '@/lib/slotSearch'
import type { SearchResult } from '@/lib/slotSearch'

// Fixed cell dimensions — never compress regardless of rack count
const CELL_GAP     = 4    // px gap between cells
const ROW_LABEL_W  = 40   // px for row number label column
const GRID_PAD     = 20   // px horizontal padding inside rack card
const ZOOM_STEP    = 16   // 10% of 160px base cell width — wired to UI in Task 3

// Module-level store — survives tab navigation
const _store: { activeTypeId: string | null } = { activeTypeId: null }

// ── Types ──────────────────────────────────────────────────────
interface RackType { id: string; name: string }

interface Rack {
  id: string
  name: string
  rack_type_id: string | null
  active: boolean
  columns: number
  rows: number
  solo_picking_pos: number | null
  combo_picking_pos: number | null
  sort_order: number
  rack_type: RackType | null
  slot_count: number
  allowed_categories: string[]
}

interface SlotBrand {
  brand_code: string
  brand_name: string
  bpu: number | null
  category:  { name: string } | null
  category1: { name: string } | null
}

interface Slot {
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
  brand: SlotBrand | null
}

// ── SlotCell (memoized) ────────────────────────────────────────
// Custom comparator: only slot data and isFlashed matter.
// Callback props (onClick, hover) are intentionally excluded so that
// PickingLine re-renders caused by modal state etc. do NOT trickle down.
interface SlotCellProps {
  slot: Slot | undefined
  isFlashed: boolean
  isSearchActive: boolean
  isHighlighted: boolean
  isAdmin: boolean
  tabIndex: number
  rackIdx: number
  colIdx: number
  rowIdx: number
  cellW: number
  onSlotClick: (slot: Slot) => void
  onContextMenu: (slot: Slot, x: number, y: number) => void
  onSpaceKey: (slot: Slot) => void
  onEnterKey: (slot: Slot, x: number, y: number) => void
  onSlotFocus: (slotId: string) => void
  onHoverEnter: (brandId: string, code: string, name: string) => void
  onHoverLeave: () => void
}

const DIR_ARROW: Record<string, string> = { above: '↑', below: '↓', left: '←', right: '→' }
const DIR_LABEL: Record<string, string> = { above: 'USE ABOVE', below: 'USE BELOW', left: 'USE LEFT', right: 'USE RIGHT' }

const SlotCell = memo(
  function SlotCell({ slot, isFlashed, isSearchActive, isHighlighted, isAdmin,
    tabIndex, rackIdx, colIdx, rowIdx, cellW,
    onSlotClick, onContextMenu, onSpaceKey, onEnterKey, onSlotFocus,
    onHoverEnter, onHoverLeave }: SlotCellProps) {
    const brand       = slot?.brand ?? null
    const isAllocated = !!brand
    const lightOn     = slot?.light_status === 'on' || slot?.light_status === 'blink'
    const isBlink     = slot?.light_status === 'blink'
    const isExpansion = slot?.slot_state === 'expansion_reserved'
    const dir         = slot?.expansion_direction ?? null

    const scale = cellW / 160
    // Escala fontes proporcionalmente; mínimos absolutos garantem legibilidade
    const fs = (base: number, min: number) => Math.max(min, Math.round(base * scale))

    return (
      <div
        tabIndex={slot ? tabIndex : -1}
        data-slot-id={slot?.id}
        data-rack-idx={rackIdx}
        data-col-idx={colIdx}
        data-row-idx={rowIdx}
        onClick={() => slot && onSlotClick(slot)}
        onContextMenu={e => {
          if (!isAdmin || !slot) return
          e.preventDefault()
          onContextMenu(slot, e.clientX, e.clientY)
        }}
        onKeyDown={e => {
          if (!slot) return
          if (e.key === ' ') {
            e.preventDefault()   // prevent page scroll
            onSpaceKey(slot)
          } else if (e.key === 'Enter') {
            e.preventDefault()   // prevent form submission / page scroll
            const rect = e.currentTarget.getBoundingClientRect()
            onEnterKey(slot, rect.left, rect.bottom + 2)
          }
        }}
        onFocus={e => {
          // Keyboard focus ring via direct DOM — no state, no re-render
          e.currentTarget.style.outline = '2px solid #2563eb'
          e.currentTarget.style.outlineOffset = '-2px'
          if (slot) onSlotFocus(slot.id)
        }}
        onBlur={e => {
          e.currentTarget.style.outline = 'none'
        }}
        style={{
          position: 'relative',
          border: isHighlighted
            ? '2px solid #2563eb'
            : isExpansion
            ? '2px dashed #a78bfa'
            : `1px solid ${isAllocated ? '#86efac' : '#e4e4e7'}`,
          background: isHighlighted
            ? '#eff6ff'
            : isExpansion ? '#faf5ff' : isAllocated ? '#f0fdf4' : '#fafafa',
          boxShadow: isHighlighted ? '0 0 0 3px rgba(37,99,235,0.2)' : undefined,
          opacity: isSearchActive && !isHighlighted ? 0.3 : 1,
          borderRadius: 3,
          minHeight: 0,
          overflow: 'hidden',
          cursor: slot ? 'pointer' : 'default',
        }}
        onMouseEnter={e => {
          if (slot) {
            // CSS brightness via direct DOM — no state, no re-render
            e.currentTarget.style.filter = 'brightness(0.96)'
            if (slot.allocated_brand_id && slot.brand) {
              onHoverEnter(slot.allocated_brand_id, slot.brand.brand_code, slot.brand.brand_name)
            }
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.filter = ''
          onHoverLeave()
        }}
      >
        {/* Realtime flash overlay */}
        {isFlashed && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            pointerEvents: 'none', borderRadius: 3,
            background: 'rgba(59,130,246,0.28)',
            animation: 'pl-flash 1.4s ease-out forwards',
          }} />
        )}

        {isExpansion ? (
          <>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <span style={{ fontSize: fs(22, 12), lineHeight: 1, color: '#7c3aed' }}>
                {dir ? DIR_ARROW[dir] : '⇿'}
              </span>
              <span style={{ fontSize: fs(9, 6), fontWeight: 800, color: '#6d28d9', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                {dir ? DIR_LABEL[dir] : 'EXPANSION'}
              </span>
            </div>
            <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: fs(9, 7), fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em', lineHeight: 1 }}>
              {slot!.bin_address}
            </span>
          </>
        ) : (
          <>
            {brand && (
              <span style={{ position: 'absolute', top: 5, left: 6, fontSize: fs(10, 7), fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#09090b', lineHeight: 1, maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {brand.brand_code}
              </span>
            )}
            {brand?.bpu != null && (
              <span style={{ position: 'absolute', top: 5, right: 6, fontSize: fs(10, 7), color: '#52525b', fontWeight: 600, lineHeight: 1 }}>
                ×{brand.bpu}
              </span>
            )}
            {brand && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'calc(100% - 20px)', textAlign: 'center',
                fontSize: fs(11, 8), fontWeight: 600, color: '#27272a', lineHeight: 1.3,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
              }}>
                {brand.brand_name}
              </div>
            )}
            <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: fs(9, 7), fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: isAllocated ? '#16a34a' : '#a1a1aa', letterSpacing: '0.04em', lineHeight: 1 }}>
              {slot?.bin_address ?? ''}
            </span>
            {slot && (
              <span style={{
                position: 'absolute', bottom: 4, right: 6,
                width: fs(16, 10), height: fs(16, 10), borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: fs(8, 6), fontWeight: 700,
                background: lightOn ? '#22c55e' : '#e4e4e7',
                color: lightOn ? '#fff' : '#a1a1aa',
                border: lightOn ? '1px solid #16a34a' : '1px solid #d4d4d8',
                animation: isBlink ? 'pl-blink 1s ease-in-out infinite' : 'none',
                lineHeight: 1, userSelect: 'none',
              }}>
                {slot.light_address ?? '·'}
              </span>
            )}
          </>
        )}
      </div>
    )
  },
  // Custom comparator — only data properties + position; callbacks intentionally ignored
  (prev, next) =>
    prev.isFlashed       === next.isFlashed       &&
    prev.isSearchActive  === next.isSearchActive  &&
    prev.isHighlighted   === next.isHighlighted   &&
    prev.isAdmin         === next.isAdmin         &&
    prev.tabIndex     === next.tabIndex     &&
    prev.rackIdx      === next.rackIdx      &&
    prev.colIdx       === next.colIdx       &&
    prev.rowIdx       === next.rowIdx       &&
    prev.cellW        === next.cellW        &&
    prev.slot?.id     === next.slot?.id     &&
    prev.slot?.slot_state        === next.slot?.slot_state        &&
    prev.slot?.allocated_brand_id === next.slot?.allocated_brand_id &&
    prev.slot?.light_address     === next.slot?.light_address     &&
    prev.slot?.light_status      === next.slot?.light_status      &&
    prev.slot?.expansion_direction === next.slot?.expansion_direction &&
    prev.slot?.bin_address       === next.slot?.bin_address
)

// ── Component ──────────────────────────────────────────────────
export function PickingLine() {
  const { profile } = useAuth()
  const { addToast } = useToast()
  const isAdmin = profile?.role?.toLowerCase() === 'admin'

  // Zoom: 160 = 100%. Range 96px (60%) – 320px (200%). Step: 16px (10%).
  const [cellW, setCellW] = useState<number>(() => {
    const stored = localStorage.getItem('nc-pl-zoom')
    const n = stored ? parseInt(stored, 10) : 160
    return isNaN(n) ? 160 : Math.min(320, Math.max(96, n))
  })

  function handleZoom(delta: number) {
    setCellW(prev => {
      const next = Math.max(96, Math.min(320, prev + delta))
      localStorage.setItem('nc-pl-zoom', String(next))
      return next
    })
  }

  function resetZoom() {
    setCellW(160)
    localStorage.setItem('nc-pl-zoom', '160')
  }

  function handlePickingLineScroll(e: React.UIEvent<HTMLDivElement>) {
    const scrollLeft = e.currentTarget.scrollLeft

    // Não mostrar pill quando o scroll está no início
    if (scrollLeft === 0) {
      if (pillHideTimerRef.current) clearTimeout(pillHideTimerRef.current)
      setPillVisible(false)
      return
    }

    // Encontrar o rack mais à esquerda ainda "dentro" da view
    // Um rack é "atual" se seu offsetLeft é <= scrollLeft + threshold
    const threshold = ROW_LABEL_W + GRID_PAD  // 60px — aligns detection with rack header left edge
    let currentName: string | null = null
    for (const rack of visibleRacks) {
      const el = rackRefs.current[rack.id]
      if (!el) continue
      if (el.offsetLeft <= scrollLeft + threshold) {
        currentName = rack.name
      }
    }

    if (currentName) setVisibleRackName(currentName)
    setPillVisible(true)

    // Debounce: some 1.5s após parar o scroll
    if (pillHideTimerRef.current) clearTimeout(pillHideTimerRef.current)
    pillHideTimerRef.current = setTimeout(() => {
      setPillVisible(false)
    }, 1500)
  }

  const [racks, setRacks]               = useState<Rack[]>([])
  const [rackTypes, setRackTypes]       = useState<RackType[]>([])
  const [activeTypeId, setActiveTypeId] = useState<string | null>(_store.activeTypeId)
  const [allSlots, setAllSlots]         = useState<Record<string, Slot[]>>({})
  const [loading, setLoading]           = useState(true)
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null)
  const [showForm, setShowForm]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Rack | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [slotModal, setSlotModal]       = useState<{ slot: ModalSlot; rack: Rack } | null>(null)
  const [printState, setPrintState]     = useState<{ rack: Rack; mode: PrintMode } | null>(null)
  const [openPrintMenu, setOpenPrintMenu]         = useState<string | null>(null)  // rackId
  const [replanningDrafts, setReplanningDrafts]   = useState<Set<string>>(new Set())
  const [replanningAction, setReplanningAction]   = useState<{ rack: Rack; type: 'start' | 'discard' } | null>(null)
  const [replanningBusy, setReplanningBusy]       = useState(false)
  const [replanningRack, setReplanningRack]       = useState<Rack | null>(null)
  const [editRack, setEditRack]                   = useState<Rack | null>(null)
  const [duplicateRack, setDuplicateRack]         = useState<Rack | null>(null)
  const [contextMenu, setContextMenu]             = useState<ContextMenuTarget | null>(null)
  const [flashedSlots, setFlashedSlots]           = useState<Set<string>>(new Set())
  const [searchQuery,           setSearchQuery]           = useState('')
  const [searchHighlightSlotId, setSearchHighlightSlotId] = useState<string | null>(null)
  const [searchDropdownIdx,     setSearchDropdownIdx]     = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Rack scroll indicator — pill
  const [visibleRackName, setVisibleRackName] = useState<string | null>(null)
  const [pillVisible,     setPillVisible]     = useState(false)
  const pillHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pillHideTimerRef.current) clearTimeout(pillHideTimerRef.current)
    }
  }, [])

  const lineRef          = useRef<HTMLDivElement>(null)
  const rackRefs         = useRef<Record<string, HTMLDivElement | null>>({})
  const pendingScrollRef = useRef<number | null>(null)
  // Ref keeps loadAll fresh inside the realtime closure (avoids stale captures)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadAllRef       = useRef<(opts?: { silent?: boolean }) => Promise<void>>(null as any)

  // ── Keyboard navigation — focus tracking + restoration ────────────────────
  const lastFocusedSlotId = useRef<string | null>(null)

  // Stable — called by SlotCell onFocus; only updates a ref, no re-render
  const handleSlotFocus = useCallback((slotId: string) => {
    lastFocusedSlotId.current = slotId
  }, [])

  // Restores keyboard focus to the last focused slot after a modal closes.
  // Uses data-slot-id attribute set on each SlotCell div.
  function restoreFocus() {
    if (!lastFocusedSlotId.current) return
    const el = document.querySelector<HTMLElement>(`[data-slot-id="${lastFocusedSlotId.current}"]`)
    el?.focus()
  }

  // ── 2D Arrow-key navigation on the picking grid ──────────────────────────
  // Handler is attached to the lineRef container (event delegation).
  // Reads data-rack-idx / data-col-idx / data-row-idx from the focused slot div.
  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    const active = document.activeElement as HTMLElement | null
    if (!active?.dataset.slotId) return          // focus is not on a slot

    const ri   = parseInt(active.dataset.rackIdx ?? '', 10)
    const ci   = parseInt(active.dataset.colIdx  ?? '', 10)
    const rowi = parseInt(active.dataset.rowIdx  ?? '', 10)
    if (isNaN(ri) || isNaN(ci) || isNaN(rowi)) return

    const rack = visibleRacks[ri]
    if (!rack) return

    let targetRi = ri, targetCi = ci, targetRowi = rowi

    if (e.key === 'ArrowDown') {
      if (rowi + 1 >= rack.rows) return           // bottom edge — no wrap
      targetRowi = rowi + 1
    } else if (e.key === 'ArrowUp') {
      if (rowi - 1 < 0) return                    // top edge — no wrap
      targetRowi = rowi - 1
    } else if (e.key === 'ArrowRight') {
      if (ci + 1 < rack.columns) {
        targetCi = ci + 1
      } else if (ri + 1 < visibleRacks.length) {  // jump to first col of next rack
        targetRi = ri + 1
        targetCi = 0
      } else return                               // last rack last col — no wrap
    } else if (e.key === 'ArrowLeft') {
      if (ci - 1 >= 0) {
        targetCi = ci - 1
      } else if (ri - 1 >= 0) {                  // jump to last col of prev rack
        targetRi = ri - 1
        targetCi = visibleRacks[ri - 1].columns - 1
      } else return                               // first rack first col — no wrap
    }

    e.preventDefault()

    const targetEl = lineRef.current?.querySelector<HTMLElement>(
      `[data-rack-idx="${targetRi}"][data-col-idx="${targetCi}"][data-row-idx="${targetRowi}"]`
    )
    if (!targetEl) return

    targetEl.focus()

    // Scroll new rack into view when crossing rack boundaries
    if (targetRi !== ri) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }

  // ── Hover preview — state lives inside PLSlotImagePreview, not here ───────
  // Updating the preview never triggers a PickingLine re-render.
  const previewRef       = useRef<PreviewHandle>(null)
  const hoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Per-brand image cache — avoids re-fetching same brand on re-hover
  const imageCacheRef    = useRef<Map<string, string | null>>(new Map())
  // Guards against race conditions when mouse moves faster than the fetch
  const hoverBrandIdRef  = useRef<string | null>(null)

  // Stable reference (empty deps) — only uses refs and module-level supabase
  const handleSlotMouseEnter = useCallback((brandId: string, brand_code: string, brand_name: string) => {
    // Debounce: ignore rapid mouse passes (< 50 ms) — prevents fetching 10 images/second
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current)
    hoverDebounceRef.current = setTimeout(() => {
      hoverDebounceRef.current = null
      hoverBrandIdRef.current  = brandId

      if (imageCacheRef.current.has(brandId)) {
        previewRef.current?.show({ id: brandId, brand_code, brand_name }, imageCacheRef.current.get(brandId)!, false)
        return
      }

      // Show shimmer immediately, then swap in the real image
      previewRef.current?.show({ id: brandId, brand_code, brand_name }, null, true)

      void supabase
        .from('brands')
        .select('image1_url')
        .eq('id', brandId)
        .single()
        .then(({ data }) => {
          const url = data?.image1_url ?? null
          imageCacheRef.current.set(brandId, url)
          if (hoverBrandIdRef.current === brandId) {
            previewRef.current?.show({ id: brandId, brand_code, brand_name }, url, false)
          }
        })
    }, 50)
  }, [])

  // Stable reference — only uses refs
  const handleSlotMouseLeave = useCallback(() => {
    if (hoverDebounceRef.current) { clearTimeout(hoverDebounceRef.current); hoverDebounceRef.current = null }
    hoverBrandIdRef.current = null
    previewRef.current?.hide()
  }, [])

  // ── Drag & Drop (sidebar reorder) ──────────────────────────────
  const dragIdRef                         = useRef<string | null>(null)
  const [dragOverId, setDragOverId]       = useState<string | null>(null)

  function handleDragStart(rackId: string) {
    dragIdRef.current = rackId
  }

  function handleDragOver(e: React.DragEvent, rackId: string) {
    e.preventDefault()
    if (dragIdRef.current !== rackId) setDragOverId(rackId)
  }

  function handleDragEnd() {
    dragIdRef.current = null
    setDragOverId(null)
  }

  async function handleDrop(targetId: string) {
    const sourceId = dragIdRef.current
    dragIdRef.current = null
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return

    // Reorder only within the current type tab
    const reordered = [...visibleRacks]
    const fromIdx   = reordered.findIndex(r => r.id === sourceId)
    const toIdx     = reordered.findIndex(r => r.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return

    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    // Recycle the sort_order slots that visibleRacks were using — so other
    // rack types are unaffected and the values remain globally unique.
    const recycledOrders = visibleRacks
      .map(r => r.sort_order)
      .sort((a, b) => a - b)

    const newOrderMap = new Map(reordered.map((r, i) => [r.id, recycledOrders[i]]))

    // Update sort_order values then RE-SORT the full array so the filter in
    // visibleRacks preserves the new order for both sidebar and grid.
    const updatedRacks = racks
      .map(r => newOrderMap.has(r.id) ? { ...r, sort_order: newOrderMap.get(r.id)! } : r)
      .sort((a, b) => a.sort_order - b.sort_order)

    setRacks(updatedRacks)  // optimistic — sidebar and grid update instantly

    // Persist only the affected racks
    await Promise.all(
      reordered.map((r, i) =>
        supabase.from('racks').update({ sort_order: recycledOrders[i] }).eq('id', r.id)
      )
    )
  }

  useEffect(() => { void loadAll() }, [])

  // ── Keep loadAllRef fresh on every render ─────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAllRef.current = loadAll })

  // ── Supabase Realtime — surgical sync across tabs/users ──────────
  useEffect(() => {
    const SLOT_SELECT = 'id, rack_id, column_letter, row_number, bin_address, allocated_brand_id, slot_state, expansion_direction, light_address, light_status, brand:allocated_brand_id(brand_code, brand_name, bpu, category:category_id(name), category1:category1_id(name))'

    function flashSlot(slotId: string) {
      setFlashedSlots(prev => new Set(prev).add(slotId))
      setTimeout(() => {
        setFlashedSlots(prev => { const s = new Set(prev); s.delete(slotId); return s })
      }, 1400)
    }

    async function handleSlotChange(payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) {
      if (payload.eventType === 'UPDATE') {
        const slotId = payload.new.id as string
        const { data } = await supabase
          .from('slots')
          .select(SLOT_SELECT)
          .eq('id', slotId)
          .single()
        if (!data) return
        const slot = data as unknown as Slot
        flashSlot(slotId)
        setAllSlots(prev => {
          const list = [...(prev[slot.rack_id] ?? [])]
          const i = list.findIndex(s => s.id === slotId)
          if (i >= 0) list[i] = slot; else list.push(slot)
          return { ...prev, [slot.rack_id]: list }
        })
        return
      }

      if (payload.eventType === 'INSERT') {
        const slotId = payload.new.id as string
        const { data } = await supabase
          .from('slots')
          .select(SLOT_SELECT)
          .eq('id', slotId)
          .single()
        if (!data) return
        const slot = data as unknown as Slot
        setAllSlots(prev => ({
          ...prev,
          [slot.rack_id]: [...(prev[slot.rack_id] ?? []), slot],
        }))
        return
      }

      if (payload.eventType === 'DELETE') {
        const old = payload.old as { id?: string; rack_id?: string }
        if (!old.id) return
        setAllSlots(prev => {
          // rack_id only available with REPLICA IDENTITY FULL; fall back to scan
          if (old.rack_id) {
            return {
              ...prev,
              [old.rack_id]: (prev[old.rack_id] ?? []).filter(s => s.id !== old.id),
            }
          }
          const updated = { ...prev }
          for (const rId of Object.keys(updated)) {
            if (updated[rId].some(s => s.id === old.id)) {
              updated[rId] = updated[rId].filter(s => s.id !== old.id)
              break
            }
          }
          return updated
        })
      }
    }

    const channel = supabase
      .channel('pl-realtime')
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'slots' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => { void handleSlotChange(payload) }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'racks' },
        (payload) => {
          void loadAllRef.current({ silent: true })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'replanning_slots' },
        (payload) => {
          void getReplanningRackIds().then(drafts => setReplanningDrafts(drafts)).catch(() => {})
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  // Restore scroll position — only after loading completes and racks are in the DOM
  useEffect(() => {
    if (!loading && pendingScrollRef.current !== null && lineRef.current) {
      lineRef.current.scrollLeft = pendingScrollRef.current
      pendingScrollRef.current = null
    }
  })

  // ── Data loading ───────────────────────────────────────────────
  // silent=true: no spinner, no tab/scroll reset — used after saves to prevent UI jumps.
  // silent=false (default): full load with spinner — used on mount and after deletes.
  async function loadAll({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setLoading(true)

    const [racksRes, slotCountRes, catRes, slotsRes] = await Promise.all([
      supabase
        .from('racks')
        .select('id, name, rack_type_id, active, columns, rows, solo_picking_pos, combo_picking_pos, sort_order, rack_type:rack_type_id(id, name)')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('slots').select('rack_id'),
      supabase.from('rack_allowed_categories').select('rack_id, category:category_id(name)'),
      supabase
        .from('slots')
        .select('id, rack_id, column_letter, row_number, bin_address, allocated_brand_id, slot_state, expansion_direction, light_address, light_status, brand:allocated_brand_id(brand_code, brand_name, bpu, category:category_id(name), category1:category1_id(name))')
        .order('column_letter')
        .order('row_number'),
    ])

    if (racksRes.error) {
      addToast('Error loading racks', 'error')
      if (!silent) setLoading(false)
      return
    }

    // Slot count per rack
    const slotCountMap: Record<string, number> = {}
    for (const s of slotCountRes.data ?? [])
      slotCountMap[s.rack_id] = (slotCountMap[s.rack_id] ?? 0) + 1

    // Categories per rack
    const catMap: Record<string, string[]> = {}
    for (const ac of catRes.data ?? []) {
      const name = (ac.category as unknown as { name: string } | null)?.name
      if (name) catMap[ac.rack_id] = [...(catMap[ac.rack_id] ?? []), name]
    }

    // Slots grouped by rack
    const slotsGrouped: Record<string, Slot[]> = {}
    for (const s of slotsRes.data ?? []) {
      if (!slotsGrouped[s.rack_id]) slotsGrouped[s.rack_id] = []
      slotsGrouped[s.rack_id].push(s as unknown as Slot)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const combined: Rack[] = (racksRes.data ?? []).map((r: any) => ({
      ...r,
      rack_type: r.rack_type ?? null,
      slot_count: slotCountMap[r.id] ?? 0,
      allowed_categories: catMap[r.id] ?? [],
      sort_order: r.sort_order ?? 0,
    }))

    // Derive unique rack types in order of first appearance
    const typesSeen = new Map<string, RackType>()
    for (const r of combined)
      if (r.rack_type) typesSeen.set(r.rack_type.id, r.rack_type)
    const types = Array.from(typesSeen.values())

    setRacks(combined)
    setRackTypes(types)
    setAllSlots(slotsGrouped)

    // Load replanning draft status (non-blocking — failure just means no badges)
    try {
      const drafts = await getReplanningRackIds()
      setReplanningDrafts(drafts)
    } catch { /* silently ignore */ }

    if (!silent) {
      // Full tab restoration — only on initial load or after destructive actions (delete)
      const firstId = types[0]?.id ?? null
      const restored = _store.activeTypeId && typesSeen.has(_store.activeTypeId)
        ? _store.activeTypeId
        : firstId
      _store.activeTypeId = restored
      setActiveTypeId(restored)
      setLoading(false)
    } else {
      // Silent refresh — preserve current tab; fall back only if it no longer exists
      if (_store.activeTypeId && !typesSeen.has(_store.activeTypeId)) {
        const firstId = types[0]?.id ?? null
        _store.activeTypeId = firstId
        setActiveTypeId(firstId)
      }
    }
  }

  // ── Replanning handlers ────────────────────────────────────────
  async function handleReplanningConfirm() {
    if (!replanningAction) return
    setReplanningBusy(true)
    const { rack, type } = replanningAction

    if (type === 'start') {
      const result = await startReplanning(rack.id)
      if (result.error) {
        addToast(`Replanning error: ${result.error}`, 'error')
      } else {
        setReplanningDrafts(prev => new Set(prev).add(rack.id))
        addToast(`Draft created for Rack ${rack.name}. Replanning editor coming soon.`, 'info')
      }
    } else {
      const result = await discardReplanning(rack.id)
      if (result.error) {
        addToast(`Discard error: ${result.error}`, 'error')
      } else {
        setReplanningDrafts(prev => { const s = new Set(prev); s.delete(rack.id); return s })
        addToast(`Draft for Rack ${rack.name} discarded.`, 'info')
      }
    }

    setReplanningBusy(false)
    setReplanningAction(null)
  }

  // ── Helpers ───────────────────────────────────────────────────
  function clearSearch() {
    setSearchQuery('')
    setSearchHighlightSlotId(null)
    setSearchDropdownIdx(-1)
  }

  function handleSearchSelect(result: SearchResult) {
    setSearchQuery(result.brandCode)
    setSearchHighlightSlotId(result.slotId)
    setSearchDropdownIdx(-1)
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-slot-id="${result.slotId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        lastFocusedSlotId.current = result.slotId
      }
    }, 50)
  }

  function selectType(id: string) {
    _store.activeTypeId = id
    setActiveTypeId(id)
    setSelectedRackId(null)
    clearSearch()
  }

  function scrollToRack(rackId: string) {
    setSelectedRackId(rackId)
    const container = lineRef.current
    const el        = rackRefs.current[rackId]
    if (container && el)
      container.scrollTo({ left: el.offsetLeft - container.offsetLeft, behavior: 'smooth' })
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error } = await supabase.from('racks').delete().eq('id', confirmDelete.id)
    setDeleting(false)
    if (error) { addToast(`Error deleting rack: ${error.message}`, 'error'); return }
    addToast(`Rack "${confirmDelete.name}" and all its slots deleted.`, 'info')
    if (selectedRackId === confirmDelete.id) setSelectedRackId(null)
    setConfirmDelete(null)
    pendingScrollRef.current = lineRef.current?.scrollLeft ?? null
    void loadAll()
  }

  // Racks visible in the current tab
  const visibleRacks = useMemo(
    () => activeTypeId ? racks.filter(r => r.rack_type?.id === activeTypeId) : racks,
    [racks, activeTypeId]
  )

  const searchableSlots = useMemo(() =>
    visibleRacks.flatMap(r =>
      (allSlots[r.id] ?? []).map(s => ({ ...s, rack_name: r.name }))
    ),
    [visibleRacks, allSlots]
  )
  const searchResults = useMemo(() =>
    searchSlots(searchableSlots, searchQuery),
    [searchableSlots, searchQuery]
  )
  const searchDropdownOpen = searchQuery.trim().length > 0

  const existingNames = racks.map(r => r.name)

  // ── Render ────────────────────────────────────────────────────
  if (replanningRack) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PLReplanningView
          rack={replanningRack}
          officialSlots={allSlots[replanningRack.id] ?? []}
          onClose={() => setReplanningRack(null)}
          onPublished={() => {
            const rackId = replanningRack!.id
            setReplanningDrafts(prev => { const s = new Set(prev); s.delete(rackId); return s })
            setReplanningRack(null)
            void loadAll({ silent: true })
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Top bar: header + toolbar on left, preview widget on right */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexShrink: 0 }}>

        {/* Left: header + toolbar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Module header */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 3 }}>
              Operational
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px' }}>
              Picking Line
            </h1>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            {isAdmin ? (
              <button onClick={() => setShowForm(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}>
                <Plus size={13} /> Add Rack
              </button>
            ) : (
              <button disabled title="Only admins can create racks"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f4f4f5', border: '1px solid #e4e4e7', color: '#a1a1aa', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'not-allowed', flexShrink: 0 }}>
                <Lock size={13} /> Add Rack
              </button>
            )}

            {/* Search input + dropdown */}
            {!loading && (
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#a1a1aa', pointerEvents: 'none', zIndex: 1 }}>⌕</span>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchDropdownIdx(-1); setSearchHighlightSlotId(null) }}
                  onKeyDown={e => {
                    if (!searchDropdownOpen) {
                      if (e.key === 'Escape') clearSearch()
                      return
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSearchDropdownIdx(i => Math.min(i + 1, searchResults.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSearchDropdownIdx(i => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter' && searchDropdownIdx >= 0) {
                      e.preventDefault()
                      handleSearchSelect(searchResults[searchDropdownIdx])
                    } else if (e.key === 'Escape') {
                      clearSearch()
                    }
                  }}
                  placeholder="Search brand code or name…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '6px 28px 6px 28px',
                    border: '1px solid #e4e4e7', background: '#fafafa',
                    fontSize: 12, color: '#09090b', outline: 'none',
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => {
                    e.target.style.borderColor = '#e4e4e7'
                    setTimeout(() => {
                      if (document.activeElement !== searchInputRef.current) {
                        setSearchDropdownIdx(-1)
                      }
                    }, 150)
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14, lineHeight: 1, padding: 2 }}
                  >×</button>
                )}

                {/* Dropdown */}
                {searchDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d4d4d8', borderTop: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 280, overflowY: 'auto' }}>
                    {searchResults.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 11, color: '#a1a1aa' }}>No allocated brands found</div>
                    ) : searchResults.map((r, i) => (
                      <div
                        key={r.slotId}
                        onMouseDown={e => { e.preventDefault(); handleSearchSelect(r) }}
                        onMouseEnter={() => setSearchDropdownIdx(i)}
                        style={{
                          padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f4f5',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: i === searchDropdownIdx ? '#eff6ff' : '#fff',
                        }}
                      >
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 800, color: '#09090b', minWidth: 42 }}>{r.brandCode}</span>
                        <span style={{ fontSize: 11, color: '#52525b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.brandName}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>{r.binAddress}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a1a1aa', flexShrink: 0 }}>
              {visibleRacks.length} rack{visibleRacks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Right: image preview widget — fixed size, isolated state — hover changes never cause PickingLine re-render */}
        <PLSlotImagePreview ref={previewRef} />

      </div>

      {/* ── Type sub-tabs ──────────────────────────────────────── */}
      {!loading && rackTypes.length > 0 && (
        <div style={{ display: 'flex', borderBottom: '2px solid #e4e4e7', flexShrink: 0 }}>
          {rackTypes.map(t => {
            const isActive = activeTypeId === t.id
            const count = racks.filter(r => r.rack_type?.id === t.id).length
            return (
              <button key={t.id} onClick={() => selectType(t.id)}
                style={{
                  padding: '8px 18px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  marginBottom: -2,
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#2563eb' : '#52525b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}>
                {t.name}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: isActive ? '#eff6ff' : '#f4f4f5', color: isActive ? '#2563eb' : '#71717a', borderRadius: 10 }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Main split: sidebar + picking line ─────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', border: '1px solid #e4e4e7', borderTop: 'none', minHeight: 0 }}>

        {/* Sidebar */}
        <div style={{ width: 172, flexShrink: 0, borderRight: '1px solid #e4e4e7', overflowY: 'auto', background: '#fafafa' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e4e4e7', fontSize: 9, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Racks
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ width: 16, height: 16, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl-spin 0.8s linear infinite', display: 'inline-block' }} />
            </div>
          ) : visibleRacks.length === 0 ? (
            <div style={{ padding: '20px 12px', fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>No racks</div>
          ) : visibleRacks.map(r => {
            const isSelected  = r.id === selectedRackId
            const isDragOver  = dragOverId === r.id
            return (
              <div
                key={r.id}
                draggable={isAdmin}
                onDragStart={() => handleDragStart(r.id)}
                onDragOver={e => handleDragOver(e, r.id)}
                onDrop={() => handleDrop(r.id)}
                onDragEnd={handleDragEnd}
                onClick={() => scrollToRack(r.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px',
                  background: isDragOver ? '#dbeafe' : isSelected ? '#eff6ff' : 'transparent',
                  borderLeft: isSelected ? '3px solid #2563eb' : isDragOver ? '3px solid #93c5fd' : '3px solid transparent',
                  borderBottom: isDragOver ? '2px solid #3b82f6' : '1px solid #f4f4f5',
                  cursor: isAdmin ? 'grab' : 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 4,
                  boxSizing: 'border-box',
                  transition: 'background 0.1s, border-color 0.1s',
                  userSelect: 'none',
                }}
                onMouseEnter={e => { if (!isSelected && !isDragOver) e.currentTarget.style.background = '#f4f4f5' }}
                onMouseLeave={e => { if (!isSelected && !isDragOver) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Grip handle — admin only */}
                {isAdmin && (
                  <div style={{ color: '#c4c4c7', marginTop: 3, flexShrink: 0 }}>
                    <GripVertical size={12} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 800, color: isSelected ? '#2563eb' : '#09090b', lineHeight: 1 }}>
                      {r.name}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: r.active ? '#dcfce7' : '#f4f4f5', color: r.active ? '#16a34a' : '#71717a' }}>
                      {r.active ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: isSelected ? '#60a5fa' : '#71717a' }}>{r.rack_type?.name ?? '—'}</div>
                  <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>{r.columns}col × {r.rows}row · {r.slot_count} slots</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Horizontal picking line wrapper (relative for overlays) ── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={lineRef} onKeyDown={handleGridKeyDown} onScroll={handlePickingLineScroll}
            style={{ width: '100%', height: '100%', display: 'flex', overflowX: 'auto', overflowY: 'hidden', background: '#fff' }}>

          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 20, height: 20, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl-spin 0.8s linear infinite' }} />
            </div>
          ) : visibleRacks.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.15 }}>⊞</div>
              <span style={{ fontSize: 12 }}>
                {isAdmin ? 'No racks yet. Click "Add Rack" to create one.' : 'No racks configured.'}
              </span>
            </div>
          ) : (
            visibleRacks.map((r, idx) => {
              const slots    = allSlots[r.id] ?? []
              const slotMap  = new Map<string, Slot>()
              for (const s of slots) slotMap.set(`${s.column_letter}-${s.row_number}`, s)

              const colLetters    = Array.from({ length: r.columns }, (_, i) => String.fromCharCode(65 + i))
              const rowNums       = Array.from({ length: r.rows }, (_, i) => i + 1)
              const isSelected    = r.id === selectedRackId
              const allocatedCount = slots.filter(s => s.allocated_brand_id).length

              // Fixed rack width: label col + N fixed-width cell cols + gaps + padding
              const rackW    = ROW_LABEL_W + r.columns * cellW + (r.columns - 1) * CELL_GAP + GRID_PAD * 2
              const gridCols = `${ROW_LABEL_W}px repeat(${r.columns}, ${cellW}px)`

              return (
                <div
                  key={r.id}
                  ref={el => { rackRefs.current[r.id] = el }}
                  style={{
                    width: rackW,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: idx < visibleRacks.length - 1 ? '2px solid #e4e4e7' : 'none',
                    borderTop: isSelected ? '4px solid #2563eb' : '4px solid transparent',
                    background: isSelected ? '#f8fbff' : '#fff',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {/* Rack header */}
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #e4e4e7', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 800, color: isSelected ? '#2563eb' : '#09090b', lineHeight: 1 }}>
                        {r.name}
                      </span>
                      {r.rack_type && (
                        <span style={{ fontSize: 13, color: '#52525b', background: '#f4f4f5', padding: '2px 8px', fontWeight: 600 }}>
                          {r.rack_type.name}
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', background: r.active ? '#dcfce7' : '#f4f4f5', color: r.active ? '#16a34a' : '#71717a' }}>
                        {r.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                      {/* Replanning draft badge */}
                      {replanningDrafts.has(r.id) && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', background: '#fef9c3', color: '#a16207', letterSpacing: '0.08em', border: '1px solid #fde047' }}>
                          DRAFT ACTIVE
                        </span>
                      )}

                      {/* Print menu + Replanning + Delete */}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>

                        {/* Replanning controls (admin only) */}
                        {isAdmin && (
                          replanningDrafts.has(r.id) ? (
                            <>
                              <button
                                onClick={() => setReplanningRack(r)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#fef9c3', border: '1px solid #fde047', color: '#713f12', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Open Draft
                              </button>
                              <button
                                onClick={() => setReplanningAction({ rack: r, type: 'discard' })}
                                title="Discard replanning draft"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                Discard
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setReplanningAction({ rack: r, type: 'start' })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #c4b5fd', color: '#7c3aed', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              Replanning
                            </button>
                          )
                        )}

                        {/* Edit + Duplicate (admin only) */}
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditRack(r)}
                              title="Edit rack"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #e4e4e7', color: '#52525b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              <Pencil size={11} /> Edit
                            </button>
                            <button
                              onClick={() => setDuplicateRack(r)}
                              title="Duplicate rack"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #e4e4e7', color: '#52525b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              <Copy size={11} /> Duplicate
                            </button>
                          </>
                        )}

                        {/* Print dropdown */}
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={() => setOpenPrintMenu(openPrintMenu === r.id ? null : r.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #e4e4e7', color: '#52525b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <Printer size={11} /> Print ▾
                          </button>
                          {openPrintMenu === r.id && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, background: '#fff', border: '1px solid #e4e4e7', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: 210 }}>
                              {([
                                { mode: 'table' as PrintMode,  Icon: List,            label: 'Picking List (Table)',    sub: 'Sorted by column, A4' },
                                { mode: 'grid'  as PrintMode,  Icon: LayoutGrid,      label: 'Rack Grid (Filled)',      sub: 'Current state, all slot data' },
                                { mode: 'notes' as PrintMode,  Icon: FileText,        label: 'Rack Grid (Empty)',       sub: 'Blank cells for manual notes' },
                              ] as const).map(({ mode, Icon, label, sub }) => (
                                <button key={mode}
                                  onClick={() => { setOpenPrintMenu(null); setPrintState({ rack: r, mode }) }}
                                  style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #f4f4f5', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#f4f4f5' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                                >
                                  <Icon size={14} style={{ color: '#71717a', marginTop: 1, flexShrink: 0 }} />
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>{label}</div>
                                    <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>{sub}</div>
                                  </div>
                                </button>
                              ))}

                              {/* Divider */}
                              <div style={{ height: 1, background: '#e4e4e7', margin: '4px 0' }} />

                              {/* XLSX export */}
                              <button
                                onClick={() => {
                                  setOpenPrintMenu(null)
                                  exportRackLabels(r.name, allSlots[r.id] ?? [])
                                }}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                              >
                                <FileSpreadsheet size={14} style={{ color: '#16a34a', marginTop: 1, flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>Export Labels (XLSX)</div>
                                  <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>Allocated slots only · Etiquetas_Rack_{r.name}_Date.xlsx</div>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>

                        {isAdmin && (
                          <button onClick={() => setConfirmDelete(r)} title="Delete rack"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <Trash2 size={11} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#71717a', alignItems: 'center' }}>
                      <span>
                        {r.columns}col × {r.rows}row = <strong style={{ color: '#09090b' }}>{r.slot_count}</strong> slots
                      </span>
                      {r.solo_picking_pos != null && (
                        <span>Solo pos: <strong style={{ color: '#09090b' }}>{r.solo_picking_pos}</strong></span>
                      )}
                      {r.combo_picking_pos != null && (
                        <span>Combo pos: <strong style={{ color: '#09090b' }}>{r.combo_picking_pos}</strong></span>
                      )}
                      {r.allowed_categories.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          {r.allowed_categories.map(cat => (
                            <span key={cat} style={{ background: '#eff6ff', color: '#2563eb', fontSize: 11, fontWeight: 600, padding: '2px 7px' }}>{cat}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Slot grid — fills full height, cells fixed width */}
                  <div style={{ padding: `16px ${GRID_PAD}px`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{
                      flex: 1,
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      gridTemplateRows: `32px repeat(${r.rows}, 1fr)`,
                      gap: CELL_GAP,
                      minHeight: 0,
                    }}>
                      {/* Column letter headers */}
                      <div />
                      {colLetters.map(letter => (
                        <div key={`h-${letter}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#71717a', letterSpacing: '0.08em' }}>
                          {letter}
                        </div>
                      ))}

                      {/* Data rows (flat siblings so they flow into the parent grid) */}
                      {rowNums.flatMap(row => [
                        <div key={`rl-${row}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, fontSize: 11, fontWeight: 700, color: '#a1a1aa' }}>
                          {String(row).padStart(2, '0')}
                        </div>,
                        ...colLetters.map((letter, colIdx) => {
                          const slot = slotMap.get(`${letter}-${row}`)
                          // Column-first tab order: A01→A02→...→B01→B02...
                          // Formula: rackOffset + colIdx * rows + rowIdx (1-based to stay > 0)
                          const slotTabIndex = idx * r.columns * r.rows + colIdx * r.rows + row
                          const rowIdx = row - 1   // 0-based for data-row-idx
                          const openContextMenu = (s: Slot, x: number, y: number) => setContextMenu({
                            slotId: s.id,
                            binAddress: s.bin_address,
                            currentBrandId: s.allocated_brand_id,
                            currentBrandCode: s.brand?.brand_code ?? null,
                            currentBrandName: s.brand?.brand_name ?? null,
                            currentLightAddress: s.light_address,
                            rackId: r.id,
                            rackTypeId: r.rack_type_id,
                            x,
                            y,
                          })
                          return (
                            <SlotCell
                              key={`${letter}-${row}`}
                              slot={slot}
                              isFlashed={slot ? flashedSlots.has(slot.id) : false}
                              isSearchActive={searchHighlightSlotId !== null}
                              isHighlighted={slot ? slot.id === searchHighlightSlotId : false}
                              isAdmin={isAdmin}
                              tabIndex={slotTabIndex}
                              rackIdx={idx}
                              colIdx={colIdx}
                              rowIdx={rowIdx}
                              cellW={cellW}
                              onSlotClick={s => setSlotModal({ slot: s as ModalSlot, rack: r })}
                              onContextMenu={openContextMenu}
                              onSpaceKey={s => setSlotModal({ slot: s as ModalSlot, rack: r })}
                              onEnterKey={openContextMenu}
                              onSlotFocus={handleSlotFocus}
                              onHoverEnter={handleSlotMouseEnter}
                              onHoverLeave={handleSlotMouseLeave}
                            />
                          )
                        }),
                      ])}
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 12, height: 12, background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 2 }} />
                        <span style={{ fontSize: 11, color: '#a1a1aa' }}>Empty</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 12, height: 12, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 2 }} />
                        <span style={{ fontSize: 11, color: '#a1a1aa' }}>Allocated</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                        {allocatedCount} / {slots.length} allocated
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          </div>  {/* closes lineRef */}

          {/* Rack pill — aparece ao scrollar; always mounted for CSS transition to work */}
          <div style={{
            position: 'absolute', top: 12, left: 12,
            padding: '4px 10px',
            background: '#09090b', color: '#fff',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            opacity: pillVisible && !!visibleRackName ? 1 : 0,
            transition: 'opacity 150ms ease',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            {visibleRackName ?? ''}
          </div>

          {/* ── Zoom control — flutuante canto inferior direito ── */}
          <div style={{
            position: 'absolute', bottom: 28, right: 12, // 28 = 12 base + ~15px Windows scrollbar clearance
            display: 'flex', alignItems: 'center',
            border: '1px solid #e4e4e7', background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            zIndex: 10,
          }}>
            <button
              onClick={() => handleZoom(-ZOOM_STEP)}
              disabled={cellW <= 96}
              title="Zoom out (−10%)"
              style={{
                padding: '5px 10px', border: 'none', borderRight: '1px solid #e4e4e7',
                background: 'none', fontSize: 15, lineHeight: 1, fontWeight: 700,
                color: cellW <= 96 ? '#d4d4d8' : '#52525b',
                cursor: cellW <= 96 ? 'not-allowed' : 'pointer',
              }}
            >−</button>
            <span
              onDoubleClick={resetZoom}
              title="Double-click to reset to 100%"
              style={{
                padding: '5px 12px', minWidth: 44, textAlign: 'center',
                fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
                color: '#09090b', userSelect: 'none', cursor: cellW !== 160 ? 'zoom-out' : 'default',
              }}
            >
              {Math.round(cellW / 160 * 100)}%
            </span>
            <button
              onClick={() => handleZoom(ZOOM_STEP)}
              disabled={cellW >= 320}
              title="Zoom in (+10%)"
              style={{
                padding: '5px 10px', border: 'none', borderLeft: '1px solid #e4e4e7',
                background: 'none', fontSize: 15, lineHeight: 1, fontWeight: 700,
                color: cellW >= 320 ? '#d4d4d8' : '#52525b',
                cursor: cellW >= 320 ? 'not-allowed' : 'pointer',
              }}
            >+</button>
          </div>

        </div>  {/* closes relative wrapper */}
      </div>

      {/* Close print menu on outside click */}
      {openPrintMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpenPrintMenu(null)} />
      )}

      {/* Print view */}
      {printState && (
        <PLPrintView
          rack={printState.rack}
          slots={allSlots[printState.rack.id] ?? []}
          mode={printState.mode}
          onClose={() => setPrintState(null)}
        />
      )}

      {/* Slot allocation modal */}
      {slotModal && (
        <PLSlotModal
          slot={slotModal.slot}
          rackId={slotModal.rack.id}
          rackTypeId={slotModal.rack.rack_type_id}
          rackTypeName={slotModal.rack.rack_type?.name ?? null}
          onClose={() => { setSlotModal(null); setTimeout(restoreFocus, 50) }}
          onSaved={() => { setSlotModal(null); void loadAll({ silent: true }); setTimeout(restoreFocus, 80) }}
        />
      )}

      {/* Add Rack modal */}
      {showForm && (
        <PLRackForm
          existingNames={existingNames}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void loadAll({ silent: true }) }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 400, background: '#fff', border: '2px solid #dc2626' }}>
            <div style={{ background: '#dc2626', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color="#fff" />
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Delete Rack — Irreversible
              </span>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: '#3f3f46', marginBottom: 20, lineHeight: 1.6 }}>
                Delete rack <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{confirmDelete.name}</strong> and all{' '}
                <strong>{confirmDelete.slot_count}</strong> slot{confirmDelete.slot_count !== 1 ? 's' : ''}? This cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                  style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: deleting ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, opacity: deleting ? 0.5 : 1 }}>
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ padding: '8px 20px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.7 : 1, minWidth: 120 }}>
                  {deleting ? 'Deleting...' : 'Delete Rack'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Replanning confirmation dialog */}
      {replanningAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: `2px solid ${replanningAction.type === 'discard' ? '#dc2626' : '#7c3aed'}` }}>
            <div style={{ background: replanningAction.type === 'discard' ? '#dc2626' : '#7c3aed', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color="#fff" />
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                {replanningAction.type === 'start' ? `Start Replanning — Rack ${replanningAction.rack.name}` : `Discard Draft — Rack ${replanningAction.rack.name}`}
              </span>
            </div>
            <div style={{ padding: 24 }}>
              {replanningAction.type === 'start' ? (
                <p style={{ fontSize: 13, color: '#3f3f46', marginBottom: 20, lineHeight: 1.6 }}>
                  A blank draft will be created for rack <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{replanningAction.rack.name}</strong> with all <strong>{replanningAction.rack.slot_count}</strong> slots empty. The live rack is not affected.
                </p>
              ) : (
                <p style={{ fontSize: 13, color: '#3f3f46', marginBottom: 20, lineHeight: 1.6 }}>
                  Permanently delete the replanning draft for rack <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{replanningAction.rack.name}</strong>? All draft changes will be lost.
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setReplanningAction(null)} disabled={replanningBusy}
                  style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: replanningBusy ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, opacity: replanningBusy ? 0.5 : 1 }}>
                  Cancel
                </button>
                <button onClick={handleReplanningConfirm} disabled={replanningBusy}
                  style={{ padding: '8px 20px', background: replanningAction.type === 'discard' ? '#dc2626' : '#7c3aed', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: replanningBusy ? 'default' : 'pointer', opacity: replanningBusy ? 0.7 : 1, minWidth: 140 }}>
                  {replanningBusy ? 'Processing...' : replanningAction.type === 'start' ? 'Create Draft' : 'Discard Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slot context menu (right-click or Enter key — admin only) */}
      {contextMenu && isAdmin && (
        <PLSlotContextMenu
          target={contextMenu}
          onClose={() => { setContextMenu(null); setTimeout(restoreFocus, 50) }}
          onSaved={() => { setContextMenu(null); void loadAll({ silent: true }); setTimeout(restoreFocus, 80) }}
        />
      )}

      {/* Edit rack modal */}
      {editRack && (
        <PLRackEditModal
          rack={editRack}
          onClose={() => setEditRack(null)}
          onSaved={() => { setEditRack(null); void loadAll({ silent: true }) }}
        />
      )}

      {/* Duplicate rack modal */}
      {duplicateRack && (
        <PLRackDuplicateModal
          rack={duplicateRack}
          existingNames={racks.map(r => r.name)}
          onClose={() => setDuplicateRack(null)}
          onSaved={() => { setDuplicateRack(null); void loadAll({ silent: true }) }}
        />
      )}

      <style>{`
        @keyframes pl-spin  { to { transform: rotate(360deg); } }
        @keyframes pl-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes pl-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  )
}
