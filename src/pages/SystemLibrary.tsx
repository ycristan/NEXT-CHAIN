import { useState } from 'react'
import { SLCategories } from './SLCategories'
import { SLSkuTypes } from './SLSkuTypes'
import { SLRackTypes } from './SLRackTypes'

type SubTab = 'categories' | 'sku-types' | 'rack-types'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'categories',  label: 'Categories' },
  { key: 'sku-types',   label: 'SKU Types' },
  { key: 'rack-types',  label: 'Rack Types' },
]

export function SystemLibrary() {
  const [active, setActive] = useState<SubTab>('categories')

  return (
    <div>
      {/* Module header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
          System
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px' }}>
          System Library
        </h1>
      </div>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e4e4e7', marginBottom: 24 }}>
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              padding: '9px 20px',
              background: 'none', border: 'none',
              borderBottom: active === key ? '2px solid #2563eb' : '2px solid transparent',
              color: active === key ? '#2563eb' : '#71717a',
              fontSize: 13, fontWeight: active === key ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.12s',
              marginBottom: -1, whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sub-tab content — all mounted, toggled with display */}
      <div style={{ display: active === 'categories' ? 'block' : 'none' }}>
        <SLCategories />
      </div>
      <div style={{ display: active === 'sku-types' ? 'block' : 'none' }}>
        <SLSkuTypes />
      </div>
      <div style={{ display: active === 'rack-types' ? 'block' : 'none' }}>
        <SLRackTypes />
      </div>
    </div>
  )
}
