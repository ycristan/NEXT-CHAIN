import { useRef, useState } from 'react'
import { Upload, CheckCircle, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

// ─── CSV parser (no external library needed) ────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') {
        row.push(field); field = ''
        if (row.some(f => f.trim())) rows.push(row)
        row = []
      } else field += ch
    }
  }
  row.push(field)
  if (row.some(f => f.trim())) rows.push(row)
  return rows
}

function csvToRecords(csv: string[][]): Record<string, string>[] {
  if (csv.length < 2) return []
  const headers = csv[0].map(h => h.trim().toUpperCase())
  return csv.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? '').trim()]))
  )
}

// ─── Column header aliases ───────────────────────────────────────────────────
const COL = {
  active:    ['BRAND ACTIVE', 'ACTIVE', 'STATUS'],
  code:      ['BRAND CODE', 'CODE'],
  name:      ['BRAND NAME', 'NAME'],
  category:  ['BRAND CATEGORY', 'CATEGORY'],
  category1: ['BRAND CATEGORY 1', 'SUBCATEGORY', 'BRAND CATEGORY1'],
  sku:       ['BRAND SKU', 'SKU TYPE', 'SKU'],
  bpu:       ['BRAND PURCHASE UNIT', 'BPU', 'PURCHASE UNIT'],
  pallet:    ['BRAND PALLET CASES', 'PALLET', 'PALLET CASES'],
}

function pick(row: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    if (row[a] !== undefined) return row[a]
  }
  return ''
}

function parseActive(val: string): boolean {
  const v = val.trim().toUpperCase()
  return ['TRUE', '1', 'YES', 'Y', 'ACTIVE', 'A'].includes(v)
}

function generateCode(name: string, used: Set<string>): string {
  const base = name.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 5) || 'SKU'
  if (!used.has(base)) return base
  let i = 2
  while (used.has(`${base}${i}`)) i++
  return `${base}${i}`
}

// ─── Types ───────────────────────────────────────────────────────────────────
type Step = 'upload' | 'lib-preview' | 'lib-running' | 'brands-preview' | 'brands-running' | 'done'

interface LibPreview {
  newCats: string[]
  existingCats: string[]
  newSubs: { name: string; parent: string }[]
  existingSubs: string[]
  newSkus: string[]
  existingSkus: string[]
}

interface BrandPreview {
  toInsert: number
  skippedCode: number
  skippedInvalid: number
}

interface Props {
  onClose: () => void
  onDone: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────
export function INVImport({ onClose, onDone }: Props) {
  const { addToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [libPreview, setLibPreview] = useState<LibPreview | null>(null)
  const [brandPreview, setBrandPreview] = useState<BrandPreview | null>(null)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState('')

  // ── File upload ─────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      addToast('Please upload a .csv file (save your Excel as CSV first)', 'error')
      return
    }
    const text = await file.text()
    const csv = parseCSV(text)
    const records = csvToRecords(csv)
    if (records.length === 0) { addToast('File is empty or could not be parsed', 'error'); return }

    setFileName(`${file.name} (${records.length} rows)`)
    setRows(records)
    await buildLibPreview(records)
    setStep('lib-preview')
  }

  // ── Phase 1 preview ─────────────────────────────────────────────────────
  async function buildLibPreview(records: Record<string, string>[]) {
    const { data: existCats } = await supabase.from('categories').select('name').eq('active', true)
    const { data: existSkus } = await supabase.from('sku_types').select('name').eq('active', true)

    const existCatNames = new Set((existCats ?? []).map(c => c.name.toLowerCase()))
    const existSkuNames = new Set((existSkus ?? []).map(s => s.name.toLowerCase()))

    const allCats = new Set<string>()
    const allSubs = new Map<string, string>() // subName → parentName
    const allSkus = new Set<string>()

    for (const row of records) {
      const cat  = pick(row, COL.category).trim()
      const sub  = pick(row, COL.category1).trim()
      const sku  = pick(row, COL.sku).trim()
      if (cat) allCats.add(cat)
      if (cat && sub) allSubs.set(sub, cat)
      if (sku) allSkus.add(sku)
    }

    const newCats      = [...allCats].filter(n => !existCatNames.has(n.toLowerCase()))
    const existingCats = [...allCats].filter(n =>  existCatNames.has(n.toLowerCase()))
    const newSubs      = [...allSubs.entries()].filter(([n]) => !existCatNames.has(n.toLowerCase())).map(([name, parent]) => ({ name, parent }))
    const existingSubs = [...allSubs.keys()].filter(n =>  existCatNames.has(n.toLowerCase()))
    const newSkus      = [...allSkus].filter(n => !existSkuNames.has(n.toLowerCase()))
    const existingSkus = [...allSkus].filter(n =>  existSkuNames.has(n.toLowerCase()))

    setLibPreview({ newCats, existingCats, newSubs, existingSubs, newSkus, existingSkus })
  }

  // ── Phase 1 run ──────────────────────────────────────────────────────────
  async function runLibraryPopulation() {
    setStep('lib-running')
    setProgress('Fetching existing data...')

    const { data: existCats } = await supabase.from('categories').select('id, name, parent_id').eq('active', true)
    const { data: existSkus } = await supabase.from('sku_types').select('id, name, code').eq('active', true)

    const catMap = new Map<string, string>((existCats ?? []).map(c => [c.name.toLowerCase(), c.id]))
    const skuMap = new Map<string, string>((existSkus ?? []).map(s => [s.name.toLowerCase(), s.id]))
    const usedCodes = new Set<string>((existSkus ?? []).map(s => s.code))

    // Insert top-level categories
    const uniqueCats = [...new Set(rows.map(r => pick(r, COL.category).trim()).filter(Boolean))]
    setProgress(`Creating ${uniqueCats.length} categories...`)
    for (const name of uniqueCats) {
      if (catMap.has(name.toLowerCase())) continue
      const { data } = await supabase.from('categories').insert({ name, parent_id: null }).select('id, name').single()
      if (data) catMap.set(data.name.toLowerCase(), data.id)
    }

    // Insert subcategories
    const subPairs = new Map<string, string>()
    for (const row of rows) {
      const cat = pick(row, COL.category).trim()
      const sub = pick(row, COL.category1).trim()
      if (cat && sub) subPairs.set(sub.toLowerCase(), cat)
    }
    setProgress(`Creating ${subPairs.size} subcategories...`)
    for (const [subLower, parentName] of subPairs.entries()) {
      if (catMap.has(subLower)) continue
      const parentId = catMap.get(parentName.toLowerCase())
      if (!parentId) continue
      // Get actual case-preserved name from original rows
      const originalName = rows.find(r => pick(r, COL.category1).trim().toLowerCase() === subLower)
      const name = pick(originalName ?? {}, COL.category1).trim()
      if (!name) continue
      const { data } = await supabase.from('categories').insert({ name, parent_id: parentId }).select('id, name').single()
      if (data) catMap.set(data.name.toLowerCase(), data.id)
    }

    // Insert SKU types
    const uniqueSkus = [...new Set(rows.map(r => pick(r, COL.sku).trim()).filter(Boolean))]
    setProgress(`Creating ${uniqueSkus.length} SKU types...`)
    for (const name of uniqueSkus) {
      if (skuMap.has(name.toLowerCase())) continue
      const code = generateCode(name, usedCodes)
      usedCodes.add(code)
      const { data } = await supabase.from('sku_types').insert({ name, code }).select('id, name').single()
      if (data) skuMap.set(data.name.toLowerCase(), data.id)
    }

    setProgress('Library populated. Building brand preview...')

    // Now build brand preview with fresh IDs
    await buildBrandPreview(catMap, skuMap)
    setStep('brands-preview')
  }

  // ── Phase 2 preview ─────────────────────────────────────────────────────
  async function buildBrandPreview(
    catMap: Map<string, string>,
    skuMap: Map<string, string>
  ) {
    const { data: existBrands } = await supabase.from('brands').select('brand_code')
    const existCodes = new Set((existBrands ?? []).map(b => b.brand_code.toUpperCase()))

    let toInsert = 0, skippedCode = 0, skippedInvalid = 0

    for (const row of rows) {
      const code  = pick(row, COL.code).trim().toUpperCase()
      const name  = pick(row, COL.name).trim()
      const cat   = pick(row, COL.category).trim().toLowerCase()
      const sub   = pick(row, COL.category1).trim().toLowerCase()
      const sku   = pick(row, COL.sku).trim().toLowerCase()
      const bpu   = parseInt(pick(row, COL.bpu))

      if (!code || !name || !catMap.has(cat) || !catMap.has(sub) || !skuMap.has(sku) || isNaN(bpu)) {
        skippedInvalid++
        continue
      }
      if (existCodes.has(code)) { skippedCode++; continue }
      toInsert++
    }

    setBrandPreview({ toInsert, skippedCode, skippedInvalid })
  }

  // ── Phase 2 run ──────────────────────────────────────────────────────────
  async function runBrandImport() {
    setStep('brands-running')
    setProgress('Fetching final library state...')

    const { data: allCats } = await supabase.from('categories').select('id, name').eq('active', true)
    const { data: allSkus } = await supabase.from('sku_types').select('id, name').eq('active', true)
    const { data: existBrands } = await supabase.from('brands').select('brand_code')

    const catMap  = new Map<string, string>((allCats ?? []).map(c => [c.name.toLowerCase(), c.id]))
    const skuMap  = new Map<string, string>((allSkus ?? []).map(s => [s.name.toLowerCase(), s.id]))
    const existCodes = new Set((existBrands ?? []).map(b => b.brand_code.toUpperCase()))

    const toInsert: object[] = []
    let skipped = 0

    for (const row of rows) {
      const code   = pick(row, COL.code).trim().toUpperCase()
      const name   = pick(row, COL.name).trim()
      const cat    = pick(row, COL.category).trim().toLowerCase()
      const sub    = pick(row, COL.category1).trim().toLowerCase()
      const sku    = pick(row, COL.sku).trim().toLowerCase()
      const bpu    = parseInt(pick(row, COL.bpu))
      const pallet = pick(row, COL.pallet).trim()
      const active = parseActive(pick(row, COL.active))

      if (!code || !name || !catMap.has(cat) || !catMap.has(sub) || !skuMap.has(sku) || isNaN(bpu)) { skipped++; continue }
      if (existCodes.has(code)) { skipped++; continue }

      toInsert.push({
        brand_code:   code,
        brand_name:   name,
        is_active:    active,
        category_id:  catMap.get(cat)!,
        category1_id: catMap.get(sub)!,
        sku_type_id:  skuMap.get(sku)!,
        bpu,
        pallet_size:  pallet && !isNaN(parseInt(pallet)) ? parseInt(pallet) : null,
      })
      existCodes.add(code)
    }

    let inserted = 0
    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      setProgress(`Importing brands… ${i} / ${toInsert.length}`)
      const { error } = await supabase.from('brands').insert(toInsert.slice(i, i + BATCH))
      if (!error) inserted += Math.min(BATCH, toInsert.length - i)
    }

    setResult(`${inserted} brands imported. ${skipped} skipped.`)
    setStep('done')
    onDone()
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const headerLabel =
    step === 'upload'          ? 'Import from CSV' :
    step === 'lib-preview'     ? 'Step 1 of 2 — Populate System Library' :
    step === 'lib-running'     ? 'Step 1 of 2 — Running…' :
    step === 'brands-preview'  ? 'Step 2 of 2 — Import Brands' :
    step === 'brands-running'  ? 'Step 2 of 2 — Running…' :
                                 'Import Complete'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 500, background: '#fff', border: '1px solid #e4e4e7' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{headerLabel}</span>
          {step !== 'lib-running' && step !== 'brands-running' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
          )}
        </div>

        <div style={{ padding: 24 }}>

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <>
              <p style={{ fontSize: 13, color: '#52525b', marginBottom: 16, lineHeight: 1.6 }}>
                Upload a <strong>.csv file</strong> exported from your Excel spreadsheet.
                The import runs in two phases: first populates the System Library (categories &amp; SKU types),
                then imports all brands.
              </p>
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed #e4e4e7', padding: '36px 24px', textAlign: 'center', cursor: 'pointer', background: '#fafafa' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e4e4e7')}
              >
                <Upload size={28} style={{ color: '#a1a1aa', marginBottom: 10 }} />
                <div style={{ fontSize: 13, color: '#52525b', fontWeight: 600 }}>Click to select CSV file</div>
                <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 4 }}>BRAND ACTIVE, BRAND CODE, BRAND NAME, BRAND CATEGORY…</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
            </>
          )}

          {/* ── STEP: LIB PREVIEW ── */}
          {step === 'lib-preview' && libPreview && (
            <>
              <div style={{ fontSize: 12, color: '#52525b', marginBottom: 16, background: '#f4f4f5', padding: '8px 12px' }}>
                📄 {fileName}
              </div>
              <p style={{ fontSize: 13, color: '#3f3f46', marginBottom: 14 }}>
                The following items will be <strong>created</strong> in the System Library:
              </p>
              <PreviewRow label="Categories" created={libPreview.newCats.length} existing={libPreview.existingCats.length} />
              <PreviewRow label="Subcategories" created={libPreview.newSubs.length} existing={libPreview.existingSubs.length} />
              <PreviewRow label="SKU Types" created={libPreview.newSkus.length} existing={libPreview.existingSkus.length} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
                <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
                <button onClick={runLibraryPopulation} style={{ padding: '8px 20px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Populate Library <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP: LIB RUNNING ── */}
          {(step === 'lib-running' || step === 'brands-running') && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 28, height: 28, border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'inv-spin 0.8s linear infinite', display: 'inline-block', marginBottom: 16 }} />
              <div style={{ fontSize: 13, color: '#52525b' }}>{progress}</div>
            </div>
          )}

          {/* ── STEP: BRANDS PREVIEW ── */}
          {step === 'brands-preview' && brandPreview && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                <CheckCircle size={16} /> System Library populated successfully.
              </div>
              <p style={{ fontSize: 13, color: '#3f3f46', marginBottom: 14 }}>Ready to import brands into inventory:</p>
              <PreviewRow label="Brands to import" created={brandPreview.toInsert} existing={0} />
              {brandPreview.skippedCode > 0 && (
                <div style={{ fontSize: 12, color: '#71717a', padding: '6px 0' }}>⚠ {brandPreview.skippedCode} skipped — code already exists</div>
              )}
              {brandPreview.skippedInvalid > 0 && (
                <div style={{ fontSize: 12, color: '#dc2626', padding: '6px 0' }}>✕ {brandPreview.skippedInvalid} skipped — missing required fields</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
                <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
                <button onClick={runBrandImport} disabled={brandPreview.toInsert === 0} style={{ padding: '8px 20px', background: '#09090b', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: brandPreview.toInsert === 0 ? 'default' : 'pointer', opacity: brandPreview.toInsert === 0 ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Import {brandPreview.toInsert} Brands <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle size={40} style={{ color: '#16a34a', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b', marginBottom: 6 }}>Import Complete</div>
              <div style={{ fontSize: 13, color: '#52525b', marginBottom: 24 }}>{result}</div>
              <button onClick={onClose} style={{ padding: '8px 24px', background: '#09090b', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes inv-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Helper sub-component ────────────────────────────────────────────────────
function PreviewRow({ label, created, existing }: { label: string; created: number; existing: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid #f4f4f5', fontSize: 13 }}>
      <span style={{ color: '#52525b', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: 10 }}>
        {created > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>+{created} new</span>}
        {existing > 0 && <span style={{ color: '#a1a1aa' }}>{existing} existing</span>}
        {created === 0 && existing === 0 && <span style={{ color: '#a1a1aa' }}>none found</span>}
      </div>
    </div>
  )
}
