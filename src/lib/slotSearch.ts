export interface SearchableSlot {
  id: string
  bin_address: string
  rack_name: string
  slot_state: string
  brand: { brand_code: string; brand_name: string } | null
}

export interface SearchResult {
  slotId: string
  binAddress: string
  rackName: string
  brandCode: string
  brandName: string
}

export function searchSlots(
  slots: SearchableSlot[],
  query: string,
  maxResults = 10
): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const allocated = slots.filter(s => s.slot_state === 'brand_allocated' && s.brand)

  const prefix: SearchResult[] = []
  const contains: SearchResult[] = []

  for (const s of allocated) {
    const code = s.brand!.brand_code.toLowerCase()
    const name = s.brand!.brand_name.toLowerCase()
    const result: SearchResult = {
      slotId: s.id,
      binAddress: s.bin_address,
      rackName: s.rack_name,
      brandCode: s.brand!.brand_code,
      brandName: s.brand!.brand_name,
    }
    if (code.startsWith(q)) {
      prefix.push(result)
    } else if (code.includes(q) || name.includes(q)) {
      contains.push(result)
    }
  }

  const byCode = (a: SearchResult, b: SearchResult) =>
    a.brandCode.localeCompare(b.brandCode, undefined, { numeric: true })

  return [...prefix.sort(byCode), ...contains.sort(byCode)].slice(0, maxResults)
}
