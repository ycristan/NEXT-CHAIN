import * as XLSX from 'xlsx'

interface ExportSlot {
  bin_address: string
  slot_state: 'empty' | 'brand_allocated' | 'expansion_reserved'
  brand: {
    brand_code: string
    brand_name: string
    bpu: number | null
  } | null
}

/**
 * Exports allocated slot labels for a rack to an XLSX file.
 * Only includes slots with a brand allocated (slot_state = 'brand_allocated').
 * Expansion-reserved and empty slots are excluded.
 *
 * Columns (in order): Brand Code, Brand Name, BPU, BIN ADDRESS
 * Filename: Etiquetas_Rack_[rackName]_[DD-MM-YYYY].xlsx
 */
export function exportRackLabels(rackName: string, slots: ExportSlot[]): void {
  // Filter: only slots with a brand (excludes expansion_reserved and empty)
  const rows = slots
    .filter(s => s.slot_state === 'brand_allocated' && s.brand)
    .sort((a, b) => a.bin_address.localeCompare(b.bin_address))
    .map(s => ({
      'Brand Code':  s.brand!.brand_code,
      'Brand Name':  s.brand!.brand_name,
      'BPU':         s.brand!.bpu ?? '',
      'BIN Address': s.bin_address,
    }))

  // Date for filename: DD-MM-YYYY
  const d = new Date()
  const dateStr = [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('-')

  const filename = `Etiquetas_Rack_${rackName}_${dateStr}.xlsx`

  // Build workbook
  const worksheet = XLSX.utils.json_to_sheet(rows)

  // Column widths (characters)
  worksheet['!cols'] = [
    { wch: 14 },  // Brand Code
    { wch: 40 },  // Brand Name
    { wch: 8  },  // BPU
    { wch: 12 },  // BIN Address
  ]

  // Bold header row
  const headerRange = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:D1')
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col })
    if (worksheet[cellAddr]) {
      worksheet[cellAddr].s = { font: { bold: true } }
    }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, `Rack ${rackName}`)

  // Trigger browser download
  XLSX.writeFile(workbook, filename)
}
