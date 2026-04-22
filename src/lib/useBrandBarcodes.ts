import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface UseBrandBarcodesResult {
  barcodes: string[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useBrandBarcodes(brandId: string | null): UseBrandBarcodesResult {
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!brandId) { setBarcodes([]); setError(null); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('brand_barcodes')
      .select('barcode')
      .eq('brand_id', brandId)
      .order('created_at')
      .then(({ data, error: supabaseError }) => {
        if (cancelled) return
        if (supabaseError) {
          setError(supabaseError.message)
          setLoading(false)
          return
        }
        setBarcodes(data?.map(r => r.barcode) ?? [])
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [brandId, tick])

  return { barcodes, loading, error, reload: () => setTick(t => t + 1) }
}
