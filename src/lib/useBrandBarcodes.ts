import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface UseBrandBarcodesResult {
  barcodes: string[]
  loading: boolean
  reload: () => void
}

export function useBrandBarcodes(brandId: string | null): UseBrandBarcodesResult {
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!brandId) { setBarcodes([]); return }
    setLoading(true)
    supabase
      .from('brand_barcodes')
      .select('barcode')
      .eq('brand_id', brandId)
      .order('created_at')
      .then(({ data }) => {
        setBarcodes(data?.map(r => r.barcode) ?? [])
        setLoading(false)
      })
  }, [brandId, tick])

  return { barcodes, loading, reload: () => setTick(t => t + 1) }
}
