export interface BrandSearchResult {
  id: string
  brandCode: string
  brandName: string
  binAddress: string
}

export function searchBrands(
  brands: { id: string; brand_code: string; brand_name: string }[],
  query: string,
  allocMap: Map<string, string[]>,
  maxResults = 10
): BrandSearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const prefix: BrandSearchResult[] = []
  const contains: BrandSearchResult[] = []

  for (const b of brands) {
    const code = b.brand_code.toLowerCase()
    const name = b.brand_name.toLowerCase()
    const result: BrandSearchResult = {
      id: b.id,
      brandCode: b.brand_code,
      brandName: b.brand_name,
      binAddress: (allocMap.get(b.id) ?? []).join(' / '),
    }
    if (code.startsWith(q)) {
      prefix.push(result)
    } else if (code.includes(q) || name.includes(q)) {
      contains.push(result)
    }
  }

  const byCode = (a: BrandSearchResult, b: BrandSearchResult) =>
    a.brandCode.localeCompare(b.brandCode, undefined, { numeric: true })

  return [...prefix.sort(byCode), ...contains.sort(byCode)].slice(0, maxResults)
}
