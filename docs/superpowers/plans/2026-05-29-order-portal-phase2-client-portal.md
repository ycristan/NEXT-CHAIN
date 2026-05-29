# Order Portal — Phase 2: Client Portal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete client-facing portal: account selector, building selector, product catalog (desktop grid + mobile list), cart, checkout with delivery calendar, and order history.

**Architecture:** All components live under `src/pages/ClientPortal/`. State is managed via `PortalContext` (Phase 1) for account/building, and local `useState` for cart. Catalog fetches brands from `client_catalogs` + `brands` + `brand_prices`. Cart submits to `orders` + `order_items`. Layout is responsive — CSS grid on ≥768px, list on <768px.

**Tech Stack:** React 19 + TypeScript + Supabase + React Router 7. Inline styles (project convention). No Tailwind in page components.

**Prerequisite:** Phase 1 must be complete and verified before starting this plan.

---

> ⚠️ **Branch:** All work on `feat/order-portal` — NEVER commit to main.

---

### Task 9: AccountSelector + BuildingSelector

**Files:**
- Create: `src/pages/ClientPortal/AccountSelector.tsx`
- Create: `src/pages/ClientPortal/BuildingSelector.tsx`
- Modify: `src/pages/ClientPortal/index.tsx` (add guard + selector routing)

- [ ] **Step 1: Create AccountSelector**

```tsx
// src/pages/ClientPortal/AccountSelector.tsx
import { usePortal } from '../../contexts/PortalContext'
import type { ClientAccount } from '../../types/orders'

export default function AccountSelector() {
  const { accounts, setActiveAccount, loading } = usePortal()

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <p style={{ color: '#64748b' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 24px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
        Select Company
      </h2>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
        Choose which company you are ordering for today.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {accounts.map((acc: ClientAccount) => (
          <button
            key={acc.id}
            onClick={() => setActiveAccount(acc)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0',
              borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                {acc.company_name}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {acc.region === 'IE' ? 'Republic of Ireland' : 'Northern Ireland'}
              </div>
            </div>
            <span style={{ color: '#3b82f6', fontSize: 18 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create BuildingSelector**

```tsx
// src/pages/ClientPortal/BuildingSelector.tsx
import { usePortal } from '../../contexts/PortalContext'
import type { ClientBuilding } from '../../types/orders'

export default function BuildingSelector() {
  const { buildings, activeAccount, setActiveBuilding, setActiveAccount, accounts } = usePortal()

  return (
    <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 24px' }}>
      {accounts.length > 1 && (
        <button
          onClick={() => setActiveAccount(null as any)}
          style={{
            background: 'none', border: 'none', color: '#3b82f6',
            fontSize: 13, cursor: 'pointer', padding: '0 0 16px', display: 'block'
          }}
        >
          ← {activeAccount?.company_name}
        </button>
      )}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
        Select Delivery Location
      </h2>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
        Where should this order be delivered?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {buildings.map((b: ClientBuilding) => (
          <button
            key={b.id}
            onClick={() => setActiveBuilding(b)}
            style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              padding: '16px 20px', background: 'white', border: '1px solid #e2e8f0',
              borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{b.address}</div>
              {b.delivery_instructions && (
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                  ⚠ {b.delivery_instructions}
                </div>
              )}
            </div>
            <span style={{ color: '#3b82f6', fontSize: 18, flexShrink: 0, marginLeft: 12 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add selectors to ClientPortalLayout routing guard**

Update `src/pages/ClientPortal/index.tsx` to show AccountSelector or BuildingSelector when needed:

```tsx
// src/pages/ClientPortal/index.tsx
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PortalProvider, usePortal } from '../../contexts/PortalContext'
import AccountSelector from './AccountSelector'
import BuildingSelector from './BuildingSelector'

function PortalGuard() {
  const { activeAccount, activeBuilding, accounts, loading } = usePortal()

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <p style={{ color: '#64748b' }}>Loading...</p>
    </div>
  )

  // Step 1: choose company (skip if only 1 account)
  if (!activeAccount) return <AccountSelector />

  // Step 2: choose building (skip if only 1 building — PortalContext auto-selects)
  if (!activeBuilding) return <BuildingSelector />

  // Step 3: show the portal
  return <Outlet />
}

export default function ClientPortalLayout() {
  const { profile } = useAuth()

  if (!profile) return null
  if (profile.role?.toLowerCase() !== 'client') return <Navigate to="/" replace />

  return (
    <PortalProvider>
      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <PortalNavbar />
        <PortalGuard />
      </div>
    </PortalProvider>
  )
}

function PortalNavbar() {
  const { activeAccount, activeBuilding, setActiveBuilding, buildings } = usePortal()
  return (
    <div style={{
      background: '#1e293b', color: 'white', padding: '12px 24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      position: 'sticky', top: 0, zIndex: 100
    }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>NEXT CHAIN</span>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
        {activeAccount && (
          <span style={{ color: '#94a3b8' }}>{activeAccount.company_name}</span>
        )}
        {activeBuilding && buildings.length > 1 && (
          <button
            onClick={() => setActiveBuilding(null as any)}
            style={{
              background: '#334155', border: 'none', color: 'white',
              padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12
            }}
          >
            📍 {activeBuilding.name} ▾
          </button>
        )}
        {activeBuilding && buildings.length === 1 && (
          <span style={{ color: '#94a3b8', fontSize: 12 }}>📍 {activeBuilding.name}</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Test manually with dev server**

```bash
npm run dev
```

1. Log in as a client user linked to 2 accounts → see AccountSelector
2. Select account → see BuildingSelector (if >1 building) or go directly to catalog placeholder
3. Select building → see catalog placeholder page
4. Navbar shows company + building name

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientPortal/AccountSelector.tsx src/pages/ClientPortal/BuildingSelector.tsx src/pages/ClientPortal/index.tsx
git commit -m "feat(portal): add AccountSelector + BuildingSelector with portal routing guard"
```

---

### Task 10: Catalog Page

**Files:**
- Create: `src/pages/ClientPortal/Catalog.tsx`
- Create: `src/pages/ClientPortal/useCart.ts`

- [ ] **Step 1: Create cart hook**

```typescript
// src/pages/ClientPortal/useCart.ts
import { useState } from 'react'
import type { CartItem } from '../../types/orders'

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([])

  function addItem(item: Omit<CartItem, 'quantity_cases' | 'quantity_units'>) {
    setItems(prev => {
      const existing = prev.find(i => i.brand_id === item.brand_id)
      if (existing) {
        return prev.map(i =>
          i.brand_id === item.brand_id
            ? { ...i, quantity_cases: i.quantity_cases + 1 }
            : i
        )
      }
      return [...prev, { ...item, quantity_cases: 1, quantity_units: 0 }]
    })
  }

  function updateCases(brandId: string, qty: number) {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.brand_id !== brandId))
    } else {
      setItems(prev =>
        prev.map(i => i.brand_id === brandId ? { ...i, quantity_cases: qty } : i)
      )
    }
  }

  function getQuantity(brandId: string): number {
    return items.find(i => i.brand_id === brandId)?.quantity_cases ?? 0
  }

  const totalItems = items.reduce((sum, i) => sum + i.quantity_cases, 0)
  const totalAmount = items.reduce((sum, i) => sum + i.price_per_case * i.quantity_cases, 0)

  function clear() { setItems([]) }

  return { items, addItem, updateCases, getQuantity, totalItems, totalAmount, clear }
}
```

- [ ] **Step 2: Create Catalog page**

```tsx
// src/pages/ClientPortal/Catalog.tsx
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { usePortal } from '../../contexts/PortalContext'
import { useCart } from './useCart'

interface CatalogBrand {
  id: string
  brand_code: string
  brand_name: string
  category_name: string
  category1_name: string
  image1_url: string | null
  bpu: number | null
  price_per_case: number
  price_per_unit: number | null
  currency: string
}

// Module-level cart store so cart persists across route changes
let _cartStore: ReturnType<typeof useCart> | null = null

export default function Catalog() {
  const { activeAccount } = usePortal()
  const navigate = useNavigate()
  const cart = useCart()

  const [brands, setBrands] = useState<CatalogBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (!activeAccount) return
    loadCatalog(activeAccount.id)
  }, [activeAccount])

  async function loadCatalog(accountId: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_catalogs')
      .select(`
        brand_id,
        brands!inner(
          id, brand_code, brand_name, bpu, image1_url,
          categories!category_id(name),
          categories!category1_id(name)
        ),
        brand_prices(price_per_case, price_per_unit, currency)
      `)
      .eq('client_account_id', accountId)

    if (!error && data) {
      const mapped: CatalogBrand[] = data
        .filter((row: any) => row.brands && row.brand_prices)
        .map((row: any) => ({
          id: row.brands.id,
          brand_code: row.brands.brand_code,
          brand_name: row.brands.brand_name,
          bpu: row.brands.bpu,
          image1_url: row.brands.image1_url,
          category_name: row.brands.categories?.name ?? '',
          category1_name: row.brands['categories!category1_id']?.name ?? '',
          price_per_case: row.brand_prices.price_per_case,
          price_per_unit: row.brand_prices.price_per_unit,
          currency: row.brand_prices.currency ?? 'EUR',
        }))
      setBrands(mapped)
    }
    setLoading(false)
  }

  const categories = useMemo(() => {
    const cats = Array.from(new Set(brands.map(b => b.category_name))).sort()
    return ['All', ...cats]
  }, [brands])

  const filtered = useMemo(() => {
    return brands.filter(b => {
      const inCat = activeCategory === 'All' || b.category_name === activeCategory
      const q = search.toLowerCase()
      const inSearch = !q || b.brand_code.toLowerCase().includes(q) || b.brand_name.toLowerCase().includes(q)
      return inCat && inSearch
    })
  }, [brands, activeCategory, search])

  function handleAdd(b: CatalogBrand) {
    cart.addItem({
      brand_id: b.id,
      brand_code: b.brand_code,
      brand_name: b.brand_name,
      image_url: b.image1_url,
      price_per_case: b.price_per_case,
      price_per_unit: b.price_per_unit,
    })
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b' }}>Loading catalog...</div>

  return (
    <div>
      {/* Search bar */}
      <div style={{ background: 'white', padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search items..."
          style={{
            width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none'
          }}
        />
      </div>

      {/* Category pills */}
      <div style={{
        background: 'white', padding: '8px 16px', borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 8, overflowX: 'auto'
      }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '4px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeCategory === cat ? 600 : 400, whiteSpace: 'nowrap',
              background: activeCategory === cat ? '#1e293b' : '#f1f5f9',
              color: activeCategory === cat ? 'white' : '#64748b'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid (desktop) / List (mobile) */}
      {isMobile
        ? <MobileList brands={filtered} cart={cart} onAdd={handleAdd} />
        : <DesktopGrid brands={filtered} cart={cart} onAdd={handleAdd} />
      }

      {/* Sticky cart bar */}
      {cart.totalItems > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#1e293b', color: 'white', padding: '12px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.15)', zIndex: 50
        }}>
          <span style={{ fontSize: 14 }}>
            {cart.totalItems} item{cart.totalItems !== 1 ? 's' : ''} · <strong>{cart.activeAccount?.company_name ?? ''} {cart.totalAmount.toFixed(2)} {/* currency */}</strong>
          </span>
          <button
            onClick={() => navigate('/portal/cart', { state: { cart: cart.items } })}
            style={{
              background: '#3b82f6', color: 'white', border: 'none',
              padding: '8px 20px', borderRadius: 8, fontWeight: 600,
              fontSize: 14, cursor: 'pointer'
            }}
          >
            View Cart →
          </button>
        </div>
      )}
    </div>
  )
}

function DesktopGrid({ brands, cart, onAdd }: {
  brands: CatalogBrand[], cart: ReturnType<typeof useCart>, onAdd: (b: CatalogBrand) => void
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 16, padding: 20, paddingBottom: 80
    }}>
      {brands.map(b => {
        const qty = cart.getQuantity(b.id)
        return (
          <div key={b.id} style={{
            background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{
              height: 120, background: '#f1f5f9', display: 'flex',
              alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
            }}>
              {b.image1_url
                ? <img src={b.image1_url} alt={b.brand_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: '#cbd5e1', fontSize: 12 }}>No image</span>
              }
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{b.brand_code}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4, lineHeight: 1.3 }}>
                {b.brand_name}
              </div>
              {b.bpu && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{b.bpu} units/case</div>}
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8', marginBottom: 10 }}>
                €{b.price_per_case.toFixed(2)}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>/case</span>
              </div>
              {qty === 0
                ? <button onClick={() => onAdd(b)} style={{
                    width: '100%', padding: '7px', background: '#3b82f6', color: 'white',
                    border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                  }}>+ Add</button>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => cart.updateCases(b.id, qty - 1)} style={{
                      flex: 1, padding: '7px', background: '#f1f5f9', border: '1px solid #e2e8f0',
                      borderRadius: 6, fontSize: 16, cursor: 'pointer', color: '#374151'
                    }}>−</button>
                    <span style={{ fontSize: 15, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                    <button onClick={() => cart.updateCases(b.id, qty + 1)} style={{
                      flex: 1, padding: '7px', background: '#3b82f6', color: 'white',
                      border: 'none', borderRadius: 6, fontSize: 16, cursor: 'pointer'
                    }}>+</button>
                  </div>
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MobileList({ brands, cart, onAdd }: {
  brands: CatalogBrand[], cart: ReturnType<typeof useCart>, onAdd: (b: CatalogBrand) => void
}) {
  return (
    <div style={{ paddingBottom: 80 }}>
      {brands.map(b => {
        const qty = cart.getQuantity(b.id)
        const inCart = qty > 0
        return (
          <div key={b.id} style={{
            background: inCart ? '#eff6ff' : 'white',
            borderBottom: '1px solid #f1f5f9',
            borderLeft: inCart ? '3px solid #3b82f6' : '3px solid transparent',
            padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center'
          }}>
            <div style={{
              width: 52, height: 52, background: '#e2e8f0', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden'
            }}>
              {b.image1_url
                ? <img src={b.image1_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 9, color: '#94a3b8' }}>IMG</span>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{b.brand_name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {b.bpu && `${b.bpu} units/case · `}
                <strong style={{ color: '#1d4ed8' }}>€{b.price_per_case.toFixed(2)}</strong>
              </div>
            </div>
            {qty === 0
              ? <button onClick={() => onAdd(b)} style={{
                  background: '#3b82f6', color: 'white', border: 'none',
                  width: 36, height: 36, borderRadius: 8, fontSize: 20, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>+</button>
              : <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => cart.updateCases(b.id, qty - 1)} style={{
                    width: 30, height: 30, background: 'white', border: '1px solid #dbeafe',
                    borderRadius: 6, fontSize: 16, cursor: 'pointer', color: '#1d4ed8'
                  }}>−</button>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', minWidth: 18, textAlign: 'center' }}>{qty}</span>
                  <button onClick={() => cart.updateCases(b.id, qty + 1)} style={{
                    width: 30, height: 30, background: '#3b82f6', color: 'white',
                    border: 'none', borderRadius: 6, fontSize: 16, cursor: 'pointer'
                  }}>+</button>
                </div>
            }
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Wire Catalog into routes in App.tsx**

Replace the catalog placeholder in `src/App.tsx`:
```tsx
import Catalog from './pages/ClientPortal/Catalog'
// ...
<Route path="catalog" element={<Catalog />} />
```

- [ ] **Step 4: Test manually**

```bash
npm run dev
```
1. Log in as client → select account + building → see catalog
2. Add items on desktop → qty counter appears inline
3. On mobile viewport (<768px) → list view
4. Cart bar appears at bottom with total when items added

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientPortal/Catalog.tsx src/pages/ClientPortal/useCart.ts src/App.tsx
git commit -m "feat(portal): add Catalog page — grid/list, category pills, cart state"
```

---

### Task 11: Cart + Checkout Page

**Files:**
- Create: `src/pages/ClientPortal/Cart.tsx`

- [ ] **Step 1: Create Cart page**

```tsx
// src/pages/ClientPortal/Cart.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePortal } from '../../contexts/PortalContext'
import { getAvailableDeliveryDates } from '../../lib/deliveryCalendar'
import type { CartItem } from '../../types/orders'

interface CartPageProps {
  cartItems: CartItem[]
  onClearCart: () => void
}

export default function CartPage({ cartItems, onClearCart }: CartPageProps) {
  const { profile } = useAuth()
  const { activeAccount, activeBuilding } = usePortal()
  const navigate = useNavigate()

  const [selectedDate, setSelectedDate] = useState<string>('')
  const [poNumber, setPoNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // We'll fetch cutoff config and holidays from Supabase in a useEffect
  const [availableDates, setAvailableDates] = useState<string[]>([])

  useState(() => {
    if (!activeAccount) return
    loadDates()
  })

  async function loadDates() {
    const [{ data: config }, { data: holidays }] = await Promise.all([
      supabase.from('cutoff_config').select('*').single(),
      supabase.from('public_holidays').select('*').eq('region', activeAccount!.region)
    ])
    if (config && holidays) {
      const dates = getAvailableDeliveryDates(activeAccount!, config, holidays)
      setAvailableDates(dates)
      if (dates.length > 0) setSelectedDate(dates[0])
    }
  }

  const total = cartItems.reduce((sum, i) => sum + i.price_per_case * i.quantity_cases, 0)

  async function handleSubmit() {
    if (!selectedDate || cartItems.length === 0 || !activeAccount || !activeBuilding || !profile) return
    setSubmitting(true)
    setError('')

    try {
      // Insert order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          client_account_id: activeAccount.id,
          building_id: activeBuilding.id,
          ordered_by: profile.id,
          desired_delivery_date: selectedDate,
          po_number: poNumber || null,
          notes: notes || null,
          total_amount: total,
        })
        .select('id, order_number')
        .single()

      if (orderErr) throw orderErr

      // Insert order items
      const itemsPayload = cartItems.map(item => ({
        order_id: order.id,
        brand_id: item.brand_id,
        quantity_cases: item.quantity_cases,
        quantity_units: item.quantity_units || null,
        price_per_case: item.price_per_case,
        price_per_unit: item.price_per_unit,
        subtotal: item.price_per_case * item.quantity_cases,
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      onClearCart()
      navigate(`/portal/order/${order.id}`, { state: { orderNumber: order.order_number } })
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cartItems.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: '#64748b', fontSize: 16 }}>Your cart is empty.</p>
      <button onClick={() => navigate('/portal/catalog')} style={{
        marginTop: 16, padding: '10px 24px', background: '#3b82f6', color: 'white',
        border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600
      }}>Browse Catalog</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>
      <button onClick={() => navigate('/portal/catalog')} style={{
        background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
        fontSize: 13, padding: '0 0 16px'
      }}>← Continue Shopping</button>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 24px' }}>
        Your Cart
      </h2>

      {/* Items */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 20, overflow: 'hidden' }}>
        {cartItems.map((item, idx) => (
          <div key={item.brand_id} style={{
            padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', borderBottom: idx < cartItems.length - 1 ? '1px solid #f1f5f9' : 'none'
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{item.brand_name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {item.quantity_cases} case{item.quantity_cases !== 1 ? 's' : ''} × €{item.price_per_case.toFixed(2)}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>
              €{(item.price_per_case * item.quantity_cases).toFixed(2)}
            </div>
          </div>
        ))}
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
          <span style={{ fontWeight: 700, color: '#1e293b' }}>Total</span>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#1d4ed8' }}>€{total.toFixed(2)}</span>
        </div>
      </div>

      {/* Delivery date */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 20, marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
          Desired Delivery Date *
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {availableDates.slice(0, 10).map(date => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '2px solid',
                borderColor: selectedDate === date ? '#3b82f6' : '#e2e8f0',
                background: selectedDate === date ? '#eff6ff' : 'white',
                color: selectedDate === date ? '#1d4ed8' : '#374151',
                fontWeight: selectedDate === date ? 600 : 400,
                cursor: 'pointer', fontSize: 13
              }}
            >
              {new Date(date + 'T12:00:00').toLocaleDateString('en-IE', {
                weekday: 'short', month: 'short', day: 'numeric'
              })}
            </button>
          ))}
        </div>
      </div>

      {/* PO + Notes */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            PO Number <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={poNumber}
            onChange={e => setPoNumber(e.target.value)}
            placeholder="e.g. PO-20260529"
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid #d1d5db',
              borderRadius: 8, fontSize: 14, boxSizing: 'border-box'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Notes <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Any special instructions..."
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid #d1d5db',
              borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedDate}
        style={{
          width: '100%', padding: 14, background: submitting || !selectedDate ? '#94a3b8' : '#2563eb',
          color: 'white', border: 'none', borderRadius: 10, fontSize: 16,
          fontWeight: 700, cursor: submitting || !selectedDate ? 'not-allowed' : 'pointer'
        }}
      >
        {submitting ? 'Submitting...' : 'Place Order'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire cart state through Catalog → Cart**

The cart state needs to persist across route changes. Update `src/pages/ClientPortal/index.tsx` to hold cart state at the layout level and pass it down via context or props, then pass to both `Catalog` and `Cart`. The simplest approach for the pilot is to lift `useCart()` into `PortalProvider` or the layout level.

Add cart to `PortalContext.tsx`:

```tsx
// Add to PortalContext:
import { useCart } from '../pages/ClientPortal/useCart'

// Add to PortalContextValue interface:
cart: ReturnType<typeof useCart>

// Add to PortalProvider:
const cart = useCart()

// Add to the Provider value:
cart
```

Then in `Catalog.tsx` and `Cart.tsx`, import cart from `usePortal()` instead of instantiating their own.

Update `src/App.tsx` to pass cart to Cart route:
```tsx
import CartPage from './pages/ClientPortal/Cart'
// ...
<Route path="cart" element={<CartFromContext />} />
```

Create `CartFromContext` wrapper in `src/pages/ClientPortal/Cart.tsx`:
```tsx
export function CartFromContext() {
  const { cart } = usePortal()
  return <CartPage cartItems={cart.items} onClearCart={cart.clear} />
}
```

- [ ] **Step 3: Test manually**

```bash
npm run dev
```
1. Add items to cart → click "View Cart →"
2. See cart summary, select delivery date, optionally add PO + notes
3. Click "Place Order" → redirects to order detail placeholder
4. Verify order appears in Supabase `orders` table with correct `ordered_by`, `building_id`, `client_account_id`

- [ ] **Step 4: Commit**

```bash
git add src/pages/ClientPortal/Cart.tsx src/contexts/PortalContext.tsx src/App.tsx
git commit -m "feat(portal): add Cart + Checkout — delivery date picker, PO, submit to Supabase"
```

---

### Task 12: My Orders Page

**Files:**
- Create: `src/pages/ClientPortal/MyOrders.tsx`
- Create: `src/pages/ClientPortal/OrderConfirmation.tsx`

- [ ] **Step 1: Create status badge helper**

```tsx
// In MyOrders.tsx — add at top of file:
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  open_prep: { label: 'Pending Review',  bg: '#dbeafe', color: '#1d4ed8' },
  open:      { label: 'Confirmed',       bg: '#fef3c7', color: '#92400e' },
  picking:   { label: 'Picking',         bg: '#ede9fe', color: '#5b21b6' },
  dispatch:  { label: 'Ready',           bg: '#d1fae5', color: '#065f46' },
  outstanding: { label: 'Action Needed', bg: '#fee2e2', color: '#991b1b' },
  transit:   { label: 'In Transit',      bg: '#cffafe', color: '#155e75' },
  delivered: { label: 'Delivered',       bg: '#dcfce7', color: '#14532d' },
  cancelled: { label: 'Cancelled',       bg: '#f1f5f9', color: '#64748b' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' }
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700,
      padding: '3px 10px', borderRadius: 99, letterSpacing: '0.04em'
    }}>
      {cfg.label}
    </span>
  )
}
```

- [ ] **Step 2: Create MyOrders page**

```tsx
// src/pages/ClientPortal/MyOrders.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { usePortal } from '../../contexts/PortalContext'
import type { Order } from '../../types/orders'

// STATUS_CONFIG and StatusBadge defined above — include them here

interface OrderWithBuilding extends Order {
  building: { name: string } | null
}

export default function MyOrders() {
  const { activeAccount } = usePortal()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderWithBuilding[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeAccount) return
    loadOrders()
  }, [activeAccount])

  async function loadOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, building:building_id(name)')
      .eq('client_account_id', activeAccount!.id)
      .order('created_at', { ascending: false })

    if (!error && data) setOrders(data as OrderWithBuilding[])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b' }}>Loading orders...</div>

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 24px' }}>
        My Orders
      </h2>

      {orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
          <p>No orders yet.</p>
          <button onClick={() => navigate('/portal/catalog')} style={{
            marginTop: 12, padding: '10px 24px', background: '#3b82f6', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600
          }}>Start Ordering</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orders.map(order => (
          <div
            key={order.id}
            onClick={() => navigate(`/portal/order/${order.id}`)}
            style={{
              background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '16px 20px', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  {order.order_number}
                </span>
                {order.po_number && (
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
                    PO: {order.po_number}
                  </span>
                )}
              </div>
              <StatusBadge status={order.status} />
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
              <span>📍 {order.building?.name ?? '—'}</span>
              <span>📅 {new Date(order.desired_delivery_date + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</span>
              <span>💶 €{Number(order.total_amount).toFixed(2)}</span>
            </div>
            {['open_prep', 'open'].includes(order.status) && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#3b82f6' }}>✏ Editable</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create OrderConfirmation page (shown after submit)**

```tsx
// src/pages/ClientPortal/OrderConfirmation.tsx
import { useLocation, useNavigate, useParams } from 'react-router-dom'

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>()
  const { state } = useLocation()
  const navigate = useNavigate()
  const orderNumber = (state as any)?.orderNumber ?? '—'

  return (
    <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
        Order Submitted!
      </h2>
      <p style={{ color: '#64748b', marginBottom: 8 }}>
        Your order <strong>{orderNumber}</strong> has been received.
      </p>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 32 }}>
        Our team will review it shortly. You'll be able to track its progress in My Orders.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/portal/orders')}
          style={{
            padding: '10px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0',
            borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151'
          }}
        >
          My Orders
        </button>
        <button
          onClick={() => navigate('/portal/catalog')}
          style={{
            padding: '10px 20px', background: '#2563eb', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'white'
          }}
        >
          New Order
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire routes in App.tsx**

```tsx
import MyOrders from './pages/ClientPortal/MyOrders'
import OrderConfirmation from './pages/ClientPortal/OrderConfirmation'
// ...
<Route path="orders" element={<MyOrders />} />
<Route path="order/:id" element={<OrderConfirmation />} />
```

- [ ] **Step 5: Add My Orders link to navbar**

Update `PortalNavbar` in `src/pages/ClientPortal/index.tsx`:
```tsx
import { Link } from 'react-router-dom'
// Inside PortalNavbar, add after the building selector:
<Link to="/portal/orders" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
  My Orders
</Link>
```

- [ ] **Step 6: Test the full flow manually**

1. Log in → select account + building → browse catalog
2. Add items → view cart → select date → submit
3. See confirmation page with order number
4. Navigate to My Orders → see the order with "Pending Review" status
5. Click the order → see order detail placeholder (full detail in Phase 3)

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ClientPortal/MyOrders.tsx src/pages/ClientPortal/OrderConfirmation.tsx src/App.tsx src/pages/ClientPortal/index.tsx
git commit -m "feat(portal): add MyOrders + OrderConfirmation — full client order flow complete"
```

---

### Task 13: Build Check + Phase 2 Complete

- [ ] **Step 1: Run full build**

```bash
npm run build
```
Zero TypeScript errors, zero warnings.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin feat/order-portal
```

---

## Phase 2 Complete ✓

After this plan, clients can:
- Log in with username + PIN
- Select their company and delivery building
- Browse their catalog (desktop grid + mobile list)
- Add items to cart, select delivery date, submit order
- View order history with status tracking

**Next:** Phase 3 — Internal Orders Module (Order Team + Warehouse + PDF + Admin)
→ Plan: `docs/superpowers/plans/2026-05-29-order-portal-phase3-internal-orders.md`
