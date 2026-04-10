import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────
export type PrintMode = 'table' | 'grid' | 'notes'

interface SlotBrand {
  brand_code: string
  brand_name: string
  bpu: number | null
  category:  { name: string } | null
  category1: { name: string } | null
}

interface PrintSlot {
  id: string
  bin_address: string
  column_letter: string
  row_number: number
  allocated_brand_id: string | null
  slot_state: 'empty' | 'brand_allocated' | 'expansion_reserved'
  expansion_direction: 'above' | 'below' | 'left' | 'right' | null
  light_address: string | null
  brand: SlotBrand | null
}

interface PrintRack {
  id: string
  name: string
  columns: number
  rows: number
  rack_type: { name: string } | null
  slot_count: number
}

interface Props {
  rack: PrintRack
  slots: PrintSlot[]
  mode: PrintMode
  onClose: () => void
  isDraft?: boolean
}

// ── Helpers ────────────────────────────────────────────────────
function today(): string {
  const d = new Date()
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/')
}

const MODE_LABEL: Record<PrintMode, string> = {
  table: 'Picking List',
  grid:  'Rack Grid — Filled',
  notes: 'Rack Grid — Manual Notes',
}

const DIR_ARROW: Record<string, string> = { above: '↑', below: '↓', left: '←', right: '→' }

// ── Print CSS (injected into <head>) ───────────────────────────
const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden !important; }
    #pl-print-root, #pl-print-root * { visibility: visible !important; }
    #pl-print-root {
      position: absolute !important;
      left: 0 !important; top: 0 !important;
      width: 100% !important;
    }
    .pl-no-print  { display: none !important; }
    .pl-avoid-break { page-break-inside: avoid; break-inside: avoid; }
    .pl-page-break  { page-break-before: always; break-before: always; }

    /* Force landscape on every page */
    @page { size: A4 landscape; margin: 10mm 12mm; }

    /* Repeat print header at top of every page */
    .pl-print-header { display: table-header-group; }

    /* Grid fills full landscape width and page height */
    .pl-grid-container {
      width: 100% !important;
      height: calc(100vh - 38mm) !important;
    }
  }
  @media screen {
    #pl-print-root {
      position: fixed; inset: 0; z-index: 9999;
      background: #fff; overflow: auto;
      padding: 32px 40px 60px;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
  }
`

// ── Sub-components ─────────────────────────────────────────────

function PrintHeader({ rack, mode, isDraft }: { rack: PrintRack; mode: PrintMode; isDraft?: boolean }) {
  return (
    <div className="pl-print-header"
      style={{ borderBottom: `3px solid ${isDraft ? '#f59e0b' : '#09090b'}`, paddingBottom: 10, marginBottom: 20 }}>

      {/* Draft identity banner — must be unmistakable */}
      {isDraft && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: '#fef08a', border: '1px solid #fde047', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#713f12' }}>
            ⚠ DRAFT / PLANNING LAYOUT — NOT THE OFFICIAL RACK
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: isDraft ? '#d97706' : '#71717a', marginBottom: 2 }}>
            Picking Line — {isDraft ? 'Draft Planning Layout' : MODE_LABEL[mode]}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 800, color: '#09090b', lineHeight: 1 }}>
              {rack.name}
            </span>
            {rack.rack_type && (
              <span style={{ fontSize: 14, fontWeight: 700, color: isDraft ? '#92400e' : '#52525b', background: isDraft ? '#fef9c3' : '#f4f4f5', padding: '2px 8px' }}>
                {rack.rack_type.name}
              </span>
            )}
            <span style={{ fontSize: 12, color: '#71717a' }}>
              {rack.columns} col × {rack.rows} row — {rack.slot_count} slots
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#71717a' }}>{isDraft ? 'Draft printed' : 'Printed'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: '#09090b' }}>{today()}</div>
        </div>
      </div>
    </div>
  )
}

// ── Table View ─────────────────────────────────────────────────
function TableView({ slots }: { slots: PrintSlot[] }) {
  const rows = [...slots].sort((a, b) => {
    if (a.column_letter !== b.column_letter) return a.column_letter.localeCompare(b.column_letter)
    return a.row_number - b.row_number
  })

  const tdBase: React.CSSProperties = {
    padding: '6px 8px', border: '1px solid #d4d4d8',
    fontSize: 11, verticalAlign: 'middle',
    pageBreakInside: 'avoid',
  }
  const thBase: React.CSSProperties = {
    ...tdBase, background: '#09090b', color: '#fff',
    fontWeight: 800, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '11%' }} /> {/* BIN */}
        <col style={{ width: '8%'  }} /> {/* LIGHT */}
        <col style={{ width: '9%'  }} /> {/* CODE */}
        <col style={{ width: '13%' }} /> {/* CAT */}
        <col style={{ width: '13%' }} /> {/* CAT1 */}
        <col style={{ width: '40%' }} /> {/* NAME */}
        <col style={{ width: '6%'  }} /> {/* BPU */}
      </colgroup>
      <thead>
        <tr>
          {['BIN ADDRESS', 'LIGHT', 'CODE', 'CATEGORY', 'CATEGORY 1', 'BRAND NAME', 'BPU'].map(h => (
            <th key={h} style={thBase}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const allocated = !!s.brand
          const expansion = s.slot_state === 'expansion_reserved'
          const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
          return (
            <tr key={s.id} className="pl-avoid-break" style={{ background: expansion ? '#faf5ff' : bg }}>
              <td style={{ ...tdBase, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 11 }}>{s.bin_address}</td>
              <td style={{ ...tdBase, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'center' }}>{s.light_address ?? '—'}</td>
              <td style={{ ...tdBase, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
                {expansion ? <span style={{ color: '#7c3aed' }}>{s.expansion_direction ? DIR_ARROW[s.expansion_direction] : '⇿'} EXP</span>
                  : allocated ? s.brand!.brand_code : '—'}
              </td>
              <td style={{ ...tdBase, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.brand?.category?.name ?? '—'}
              </td>
              <td style={{ ...tdBase, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.brand?.category1?.name ?? '—'}
              </td>
              <td style={{ ...tdBase, fontWeight: allocated ? 600 : 400, color: allocated ? '#09090b' : '#a1a1aa' }}>
                {allocated ? s.brand!.brand_name : '—'}
              </td>
              <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700 }}>
                {s.brand?.bpu != null ? `×${s.brand.bpu}` : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Grid View (shared by 'grid' and 'notes') ───────────────────
function GridView({ slots, rack, mode }: { slots: PrintSlot[]; rack: PrintRack; mode: 'grid' | 'notes' }) {
  const slotMap = new Map<string, PrintSlot>()
  for (const s of slots) slotMap.set(`${s.column_letter}-${s.row_number}`, s)

  const colLetters = Array.from({ length: rack.columns }, (_, i) => String.fromCharCode(65 + i))
  const rowNums    = Array.from({ length: rack.rows },    (_, i) => i + 1)

  // Grid column template: label + N equal columns
  const gridCols = `28px repeat(${rack.columns}, 1fr)`

  // Cell sizing
  const cellH = mode === 'notes' ? 80 : 64  // px — notes taller for writing space

  const cellBase: React.CSSProperties = {
    border: '1px solid #d4d4d8',
    position: 'relative',
    minHeight: cellH,
    background: '#fff',
    borderRadius: 2,
    overflow: 'hidden',
  }

  return (
    <div className="pl-grid-container"
      style={{ display: 'grid', width: '100%', gridTemplateColumns: gridCols, gridTemplateRows: `24px repeat(${rack.rows}, minmax(${cellH}px, 1fr))`, gap: 3 }}>
      {/* Column headers */}
      <div />
      {colLetters.map(l => (
        <div key={`h-${l}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#52525b' }}>
          {l}
        </div>
      ))}

      {/* Rows */}
      {rowNums.flatMap(row => [
        <div key={`rl-${row}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 5, fontSize: 9, fontWeight: 700, color: '#a1a1aa' }}>
          {String(row).padStart(2, '0')}
        </div>,
        ...colLetters.map(letter => {
          const slot = slotMap.get(`${letter}-${row}`)
          const brand = slot?.brand ?? null
          const isExpansion = slot?.slot_state === 'expansion_reserved'
          const dir = slot?.expansion_direction ?? null

          const cellStyle: React.CSSProperties = {
            ...cellBase,
            border: isExpansion ? '2px dashed #a78bfa' : '1px solid #d4d4d8',
            background: isExpansion ? '#faf5ff' : (brand ? '#f0fdf4' : '#fff'),
          }

          return (
            <div key={`${letter}-${row}`} className="pl-avoid-break" style={cellStyle}>
              {isExpansion && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, color: '#7c3aed', lineHeight: 1 }}>{dir ? DIR_ARROW[dir] : '⇿'}</div>
                  <div style={{ fontSize: 7, fontWeight: 800, color: '#6d28d9', letterSpacing: '0.05em', marginTop: 2 }}>
                    {dir ? `USE ${dir.toUpperCase()}` : 'EXP'}
                  </div>
                </div>
              )}

              {!isExpansion && mode === 'grid' && brand && (
                <>
                  <span style={{ position: 'absolute', top: 4, left: 5, fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#09090b', maxWidth: '44%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {brand.brand_code}
                  </span>
                  {brand.bpu != null && (
                    <span style={{ position: 'absolute', top: 4, right: 5, fontSize: 8, fontWeight: 600, color: '#52525b' }}>
                      ×{brand.bpu}
                    </span>
                  )}
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)', width: 'calc(100% - 16px)',
                    textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#27272a',
                    lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {brand.brand_name}
                  </div>
                  <span style={{ position: 'absolute', bottom: 4, left: 5, fontSize: 7, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#16a34a' }}>
                    {slot?.bin_address}
                  </span>
                  {slot?.light_address && (
                    <span style={{ position: 'absolute', bottom: 4, right: 5, fontSize: 7, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#16a34a' }}>
                      💡{slot.light_address}
                    </span>
                  )}
                </>
              )}

              {/* Always: bin address bottom-left (empty or notes mode) */}
              {!isExpansion && (mode === 'notes' || !brand) && (
                <span style={{ position: 'absolute', bottom: 4, left: 5, fontSize: 7, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#a1a1aa' }}>
                  {slot?.bin_address}
                </span>
              )}
            </div>
          )
        }),
      ])}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export function PLPrintView({ rack, slots, mode, onClose, isDraft }: Props) {
  useEffect(() => {
    // Inject print CSS
    const style = document.createElement('style')
    style.id = 'pl-print-styles'
    style.textContent = PRINT_STYLES
    document.head.appendChild(style)

    // Auto-print after layout settles
    const timer = setTimeout(() => window.print(), 250)

    // Close after user dismisses print dialog
    const afterPrint = () => onClose()
    window.addEventListener('afterprint', afterPrint)

    return () => {
      document.head.removeChild(style)
      clearTimeout(timer)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [])

  const content = (
    <div id="pl-print-root">
      {/* Screen-only toolbar */}
      <div className="pl-no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e4e4e7' }}>
        <button onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'none', border: '1px solid #e4e4e7', fontSize: 12, cursor: 'pointer' }}>
          <X size={13} /> Close Preview
        </button>
        <button onClick={() => window.print()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Printer size={13} /> Print / Save PDF
        </button>
        <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 8 }}>
          This preview will auto-open the print dialog. Use "Save as PDF" in your browser to export.
        </span>
      </div>

      {/* Printable content — table layout enables header-group repeat across pages */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: 0, fontWeight: 'normal' }}>
              <PrintHeader rack={rack} mode={mode} isDraft={isDraft} />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 0 }}>
              {mode === 'table' && <TableView slots={slots} />}
              {(mode === 'grid' || mode === 'notes') && <GridView slots={slots} rack={rack} mode={mode} />}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return createPortal(content, document.body)
}
