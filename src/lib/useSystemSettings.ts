import { useState, useEffect } from 'react'

export interface SystemSettings {
  currency: string
  currencySymbol: string
  unitSystem: 'metric' | 'imperial'
  dateFormat: string
  wholesaleMargins: [number, number, number]
  vendingMargins: [number, number, number]
}

// Module-level cache — fetched once per session
let _cache: SystemSettings | null = null

export function parseSettingsRows(rows: { key: string; value: string }[]): SystemSettings {
  const get = (key: string, fallback: string) =>
    rows.find(r => r.key === key)?.value ?? fallback

  const currency = get('currency', 'EUR')

  // Derive currency symbol via Intl — no hardcoded symbols
  let currencySymbol = '€'
  try {
    const formatted = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0)
    currencySymbol = formatted.replace(/[\d,.\s]/g, '').trim()
  } catch {
    currencySymbol = currency
  }

  return {
    currency,
    currencySymbol,
    unitSystem: (get('unit_system', 'metric') as 'metric' | 'imperial'),
    dateFormat: get('date_format', 'DD/MM/YYYY'),
    wholesaleMargins: [
      Number(get('wholesale_margin_1', '35')),
      Number(get('wholesale_margin_2', '40')),
      Number(get('wholesale_margin_3', '45')),
    ],
    vendingMargins: [
      Number(get('vending_margin_1', '50')),
      Number(get('vending_margin_2', '60')),
      Number(get('vending_margin_3', '65')),
    ],
  }
}

export function useSystemSettings(): SystemSettings | null {
  const [settings, setSettings] = useState<SystemSettings | null>(_cache)

  useEffect(() => {
    if (_cache) { setSettings(_cache); return }
    async function load() {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase.from('system_settings').select('key, value')
      if (data) {
        _cache = parseSettingsRows(data)
        setSettings(_cache)
      }
    }
    void load()
  }, [])

  return settings
}
