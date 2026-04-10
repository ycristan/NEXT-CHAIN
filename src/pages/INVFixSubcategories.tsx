import { useRef, useState } from 'react'
import { Upload, AlertTriangle, CheckCircle, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

// ─── CSV parser ───────────────────────────────────────────────────────────────
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

function pickCol(row: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) { if (row[a] !== undefined) return row[a] }
  return ''
}

const CODE_ALIASES  = ['BRAND CODE', 'CODE', 'BRAND_CODE']
const CAT1_ALIASES  = ['CATEGORY 1', 'CATEGORY1', 'CAT1', 'SUBCATEGORY', 'CATEGORY_1']

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'upload' | 'confirm' | 'running' | 'done'

interface ParsedRow { code: string; cat1: string }

interface FailedRow {
  brandCode: string
  category1: string
  reason: 'Brand not found' | 'Subcategory not found'
}

interface Props { onClose: () => void; onDone: () => void }

// ─── Component ────────────────────────────────────────────────────────────────
export function INVFixSubcategories({ onClose, onDone }: Props) {
  const { addToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]           = useState<Step>('upload')
  const [processing, setProcessing] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragging, setDragging]   = useState(false)
  const [fileName, setFileName]   = useState('')
  const [rows, setRows]           = useState<ParsedRow[]>([])
  const [progress, setProgress]   = useState('')
  const [updated, setUpdated]     = useState(0)
  const [failures, setFailures]   = useState<FailedRow[]>([])

  // ── File handling ──────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setUploadError('')
    setProcessing(true)
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setUploadError('File must be a .csv — save your spreadsheet as CSV first.')
        return
      }
      const text = await file.text()
      const records = csvToRecords(parseCSV(text))
      if (records.length === 0) {
        setUploadError('File is empty or could not be parsed.')
        return
      }

      // Show which headers were found to help the user debug mismatches
      const foundHeaders = Object.keys(records[0]).join(', ')

      const parsed: ParsedRow[] = []
      for (const r of records) {
        const code = pickCol(r, CODE_ALIASES).trim().toUpperCase()
        const cat1 = pickCol(r, CAT1_ALIASES).trim()
        if (code && cat1) parsed.push({ code, cat1 })
      }
      if (parsed.length === 0) {
        setUploadError(
          `No valid rows found. Headers detected: ${foundHeaders}\n` +
          `Expected: "Brand Code" (or CODE) and "Category 1" (or CATEGORY1, SUBCATEGORY).`
        )
        return
      }

      setFileName(`${file.name} — ${parsed.length} row${parsed.length !== 1 ? 's' : ''}`)
      setRows(parsed)
      setStep('confirm')
    } finally {
      setProcessing(false)
      // Reset input so the same file can be re-selected after an error
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Process updates ────────────────────────────────────────────────────────
  async function runUpdate() {
    setStep('running')
    setProgress('Loading brands and subcategories…')

    // Fetch all brands (code → id)
    const { data: brands, error: bErr } = await supabase
      .from('brands').select('id, brand_code')
    if (bErr) { addToast('Failed to load brands', 'error'); onClose(); return }

    // Fetch all subcategories (name → id, only where parent_id is not null)
    const { data: subcats, error: sErr } = await supabase
      .from('categories').select('id, name').not('parent_id', 'is', null).eq('active', true)
    if (sErr) { addToast('Failed to load subcategories', 'error'); onClose(); return }

    const brandMap = new Map<string, string>(
      (brands ?? []).map(b => [b.brand_code.toUpperCase(), b.id])
    )
    const subMap = new Map<string, string>(
      (subcats ?? []).map(s => [s.name.toLowerCase(), s.id])
    )

    // Classify rows into updates and failures
    const fails: FailedRow[] = []
    // Map: subcategoryId → brandIds to update
    const updateGroups = new Map<string, string[]>()

    for (const row of rows) {
      const brandId = brandMap.get(row.code)
      if (!brandId) {
        fails.push({ brandCode: row.code, category1: row.cat1, reason: 'Brand not found' })
        continue
      }
      const subId = subMap.get(row.cat1.toLowerCase())
      if (!subId) {
        fails.push({ brandCode: row.code, category1: row.cat1, reason: 'Subcategory not found' })
        continue
      }
      const group = updateGroups.get(subId) ?? []
      group.push(brandId)
      updateGroups.set(subId, group)
    }

    // Execute one UPDATE per subcategory group (efficient batching)
    let updatedCount = 0
    const groups = [...updateGroups.entries()]
    for (let i = 0; i < groups.length; i++) {
      const [subId, brandIds] = groups[i]
      setProgress(`Updating… ${updatedCount} / ${rows.length - fails.length}`)
      const { error } = await supabase
        .from('brands')
        .update({ category1_id: subId })
        .in('id', brandIds)
      if (!error) updatedCount += brandIds.length
    }

    setUpdated(updatedCount)
    setFailures(fails)
    setStep('done')
    if (updatedCount > 0) onDone()
  }

  // ── Export failures CSV ────────────────────────────────────────────────────
  function exportFailures() {
    const lines = [
      'Brand Code,Category 1,Reason',
      ...failures.map(f => `${f.brandCode},"${f.category1}","${f.reason}"`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fix-subcategories-failures.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Header label ──────────────────────────────────────────────────────────
  const headerLabel =
    step === 'upload'  ? 'Fix Subcategories (Category 1)' :
    step === 'confirm' ? 'Confirm Update' :
    step === 'running' ? 'Updating…' :
                         'Update Complete'

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #e4e4e7', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{headerLabel}</span>
          {step !== 'running' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
          )}
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <>
              <p style={{ fontSize: 13, color: '#52525b', marginBottom: 16, lineHeight: 1.6 }}>
                Upload a CSV with two columns: <strong>Brand Code</strong> and <strong>Category 1</strong>.
                Only the subcategory field will be updated — no other brand data is touched.
              </p>

              <div
                onClick={() => !processing && fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f) void handleFile(f)
                }}
                style={{
                  border: `2px dashed ${dragging ? '#2563eb' : uploadError ? '#dc2626' : '#e4e4e7'}`,
                  padding: '36px 24px', textAlign: 'center',
                  cursor: processing ? 'wait' : 'pointer',
                  background: dragging ? '#eff6ff' : '#fafafa',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                {processing ? (
                  <>
                    <div style={{ width: 24, height: 24, border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'inv-spin 0.8s linear infinite', display: 'inline-block', marginBottom: 10 }} />
                    <div style={{ fontSize: 13, color: '#52525b' }}>Reading file…</div>
                  </>
                ) : (
                  <>
                    <Upload size={28} style={{ color: uploadError ? '#dc2626' : '#a1a1aa', marginBottom: 10 }} />
                    <div style={{ fontSize: 13, color: '#52525b', fontWeight: 600 }}>
                      Click or drag a CSV file here
                    </div>
                    <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 4 }}>
                      Columns: Brand Code · Category 1
                    </div>
                  </>
                )}
              </div>

              {uploadError && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                  {uploadError}
                </div>
              )}

              <input ref={fileRef} type="file" accept=".csv,.CSV" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
            </>
          )}

          {/* ── CONFIRM ── */}
          {step === 'confirm' && (
            <>
              <div style={{ display: 'flex', gap: 12, background: '#fef9c3', border: '1px solid #fde047', padding: '12px 16px', marginBottom: 20 }}>
                <AlertTriangle size={18} style={{ color: '#ca8a04', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#713f12', lineHeight: 1.5, margin: 0 }}>
                  This operation will <strong>permanently overwrite</strong> the subcategory of matching brands.
                  Other fields (name, BPU, images, etc.) will not be changed.
                  Do you want to continue?
                </p>
              </div>
              <div style={{ fontSize: 12, color: '#52525b', background: '#f4f4f5', padding: '8px 12px', marginBottom: 20 }}>
                📄 {fileName}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={() => void runUpdate()} style={{ padding: '8px 20px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Yes, Update Subcategories
                </button>
              </div>
            </>
          )}

          {/* ── RUNNING ── */}
          {step === 'running' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 28, height: 28, border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'inv-spin 0.8s linear infinite', display: 'inline-block', marginBottom: 16 }} />
              <div style={{ fontSize: 13, color: '#52525b' }}>{progress}</div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <>
              <div style={{ textAlign: 'center', paddingBottom: 20, borderBottom: failures.length > 0 ? '1px solid #e4e4e7' : 'none' }}>
                <CheckCircle size={36} style={{ color: '#16a34a', marginBottom: 10 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b', marginBottom: 4 }}>
                  {updated} brand{updated !== 1 ? 's' : ''} updated successfully.
                </div>
                {failures.length > 0 && (
                  <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                    {failures.length} failure{failures.length !== 1 ? 's' : ''} — see below.
                  </div>
                )}
              </div>

              {failures.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 10px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Failed Updates</span>
                    <button
                      onClick={exportFailures}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#52525b' }}
                    >
                      <Download size={12} /> Export Failures (.csv)
                    </button>
                  </div>

                  <div style={{ border: '1px solid #e4e4e7', maxHeight: 260, overflowY: 'auto' }}>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                      {['Brand Code', 'Category 1', 'Reason'].map(h => (
                        <div key={h} style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
                      ))}
                    </div>
                    {failures.map((f, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', borderBottom: '1px solid #f4f4f5' }}>
                        <div style={{ padding: '8px 10px', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#09090b' }}>{f.brandCode}</div>
                        <div style={{ padding: '8px 10px', fontSize: 12, color: '#3f3f46' }}>{f.category1}</div>
                        <div style={{ padding: '8px 10px', fontSize: 11, color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.reason}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button onClick={onClose} style={{ padding: '8px 24px', background: '#09090b', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes inv-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
