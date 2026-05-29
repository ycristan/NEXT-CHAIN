# Order Portal — Phase 3: Internal Orders Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the internal Orders module for Order Team and Warehouse Team: order queue, per-status action views, warehouse picking list, PDF print, and admin client management (accounts, buildings, catalogs, users, prices).

**Architecture:** All internal order pages live under `src/pages/Orders/`. Role-based rendering determines which actions are visible (`admin`/`manager` = Order Team, `operator` = Warehouse). The module is added to the existing WMS sidebar as a new tab. PDF print follows the existing `@media print` pattern used in PLPrintView.

**Tech Stack:** React 19 + TypeScript + Supabase + React Router 7. Inline styles (project convention).

**Prerequisite:** Phases 1 and 2 must be complete and verified.

---

> ⚠️ **Branch:** All work on `feat/order-portal` — NEVER commit to main.

---

### Task 14: Orders Sidebar Entry + OrderQueue Page

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (or wherever the sidebar navigation is defined — read the file first)
- Create: `src/pages/Orders/OrderQueue.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Read the current sidebar component**

Read `src/components/layout/Sidebar.tsx` (or the equivalent file — check `src/components/layout/` directory). Understand how tabs are added and what props they expect.

- [ ] **Step 2: Add Orders entry to sidebar**

Following the existing pattern for sidebar items (read the file first to match exactly), add an "Orders" entry that opens the `/orders` route. Only show to non-client roles.

The exact code depends on the sidebar pattern — the key logic is:
```tsx
// Only show to internal roles (not client)
if (profile?.role?.toLowerCase() !== 'client') {
  // Add Orders tab following the same pattern as other tabs
}
```

- [ ] **Step 3: Create OrderQueue page**

```tsx
// src/pages/Orders/OrderQueue.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Order, OrderStatus } from '../../types/orders'

interface OrderWithMeta extends Order {
  client_account: { company_name: string } | null
  building: { name: string } | null
  ordered_by_profile: { portal_username: string | null; full_name: string | null } | null
  item_count: number
}

const TABS: { status: OrderStatus | 'all'; label: string; color: string }[] = [
  { status: 'all',         label: 'All',           color: '#64748b' },
  { status: 'open_prep',   label: 'Pending Review', color: '#1d4ed8' },
  { status: 'open',        label: 'Confirmed',      color: '#92400e' },
  { status: 'picking',     label: 'Picking',        color: '#5b21b6' },
  { status: 'dispatch',    label: 'Ready',          color: '#065f46' },
  { status: 'outstanding', label: 'Action Needed',  color: '#991b1b' },
  { status: 'transit',     label: 'In Transit',     color: '#155e75' },
  { status: 'delivered',   label: 'Delivered',      color: '#14532d' },
]

const WAREHOUSE_TABS: typeof TABS = [
  { status: 'picking',  label: 'To Pick',  color: '#5b21b6' },
  { status: 'dispatch', label: 'Ready',    color: '#065f46' },
]

export default function OrderQueue() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isWarehouse = profile?.role?.toLowerCase() === 'operator'

  const tabs = isWarehouse ? WAREHOUSE_TABS : TABS
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>(
    isWarehouse ? 'picking' : 'open_prep'
  )
  const [orders, setOrders] = useState<OrderWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadOrders() }, [activeTab])

  async function loadOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select(`
        *,
        client_account:client_account_id(company_name),
        building:building_id(name),
        ordered_by_profile:ordered_by(portal_username, full_name),
        order_items(id)
      `)
      .order('created_at', { ascending: false })

    if (activeTab !== 'all') query = query.eq('status', activeTab)

    const { data, error } = await query
    if (!error && data) {
      setOrders(data.map((o: any) => ({
        ...o,
        item_count: o.order_items?.length ?? 0,
      })) as OrderWithMeta[])
    }
    setLoading(false)
  }

  const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    open_prep:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Pending Review' },
    open:        { bg: '#fef3c7', color: '#92400e', label: 'Confirmed' },
    picking:     { bg: '#ede9fe', color: '#5b21b6', label: 'Picking' },
    dispatch:    { bg: '#d1fae5', color: '#065f46', label: 'Ready' },
    outstanding: { bg: '#fee2e2', color: '#991b1b', label: 'Action Needed' },
    transit:     { bg: '#cffafe', color: '#155e75', label: 'In Transit' },
    delivered:   { bg: '#dcfce7', color: '#14532d', label: 'Delivered' },
    cancelled:   { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled' },
  }

  return (
    <div style={{ padding: '24px 24px 0' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>
        Orders
      </h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.status}
            onClick={() => setActiveTab(tab.status)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === tab.status ? 700 : 400,
              background: activeTab === tab.status ? '#1e293b' : '#f1f5f9',
              color: activeTab === tab.status ? 'white' : '#64748b'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#64748b' }}>Loading...</p>}

      {!loading && orders.length === 0 && (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>No orders in this category.</p>
      )}

      {/* Order rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orders.map(order => {
          const badge = STATUS_BADGE[order.status] ?? { bg: '#f1f5f9', color: '#64748b', label: order.status }
          return (
            <div
              key={order.id}
              onClick={() => navigate(`/orders/${order.id}`)}
              style={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '14px 18px', cursor: 'pointer', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                    {order.order_number}
                  </span>
                  <span style={{
                    background: badge.bg, color: badge.color, fontSize: 11,
                    fontWeight: 700, padding: '2px 8px', borderRadius: 99
                  }}>{badge.label}</span>
                  {order.po_number && (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>PO: {order.po_number}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b' }}>
                  <span>🏢 {order.client_account?.company_name ?? '—'}</span>
                  <span>📍 {order.building?.name ?? '—'}</span>
                  <span>👤 {order.ordered_by_profile?.portal_username ?? order.ordered_by_profile?.full_name ?? '—'}</span>
                  <span>📅 {new Date(order.desired_delivery_date + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</span>
                  <span>{order.item_count} item{order.item_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1d4ed8' }}>
                  €{Number(order.total_amount).toFixed(2)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add /orders routes to App.tsx**

```tsx
import OrderQueue from './pages/Orders/OrderQueue'
// (OrderDetail added in next task)
// ...
// Inside InternalLayout routes:
<Route path="orders" element={<OrderQueue />} />
<Route path="orders/:id" element={<div style={{padding:24}}>Order Detail — Task 15</div>} />
```

- [ ] **Step 5: Test manually**

```bash
npm run dev
```
1. Log in as admin/manager → see "Orders" in sidebar
2. Navigate to Orders → see queue with correct tab defaults
3. Log in as operator → see only Picking + Ready tabs

- [ ] **Step 6: Commit**

```bash
git add src/pages/Orders/OrderQueue.tsx src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat(orders): add OrderQueue — role-based tabs, status badges, order list"
```

---

### Task 15: OrderDetail — Order Team + Warehouse Actions

**Files:**
- Create: `src/pages/Orders/OrderDetail.tsx`

- [ ] **Step 1: Create OrderDetail page**

```tsx
// src/pages/Orders/OrderDetail.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Order, OrderItem, OrderWithDetails, OutstandingReason } from '../../types/orders'

const OUTSTANDING_REASONS: { value: OutstandingReason; label: string }[] = [
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'outdated',     label: 'Outdated / Expired' },
  { value: 'damaged',      label: 'Damaged' },
  { value: 'other',        label: 'Other' },
]

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const isAdmin = profile?.role?.toLowerCase() === 'admin'
  const isManager = profile?.role?.toLowerCase() === 'manager'
  const isOperator = profile?.role?.toLowerCase() === 'operator'
  const isOrderTeam = isAdmin || isManager

  const [order, setOrder] = useState<OrderWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Outstanding item state
  const [outstandingEdits, setOutstandingEdits] = useState<
    Record<string, { reason: OutstandingReason; notes: string }>
  >({})

  useEffect(() => { loadOrder() }, [id])

  async function loadOrder() {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        client_account:client_account_id(company_name, region),
        building:building_id(name, address, delivery_instructions),
        order_items(
          *,
          brand:brand_id(brand_code, brand_name)
        )
      `)
      .eq('id', id)
      .single()

    if (!error && data) setOrder(data as OrderWithDetails)
    setLoading(false)
  }

  // ── Order Team actions ──────────────────────────────

  async function handleConfirmSendToWarehouse() {
    if (!order) return
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'open', confirmed_at: new Date().toISOString() })
      .eq('id', order.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    loadOrder()
  }

  async function handleMarkTransit() {
    if (!order) return
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'transit', transit_at: new Date().toISOString() })
      .eq('id', order.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    loadOrder()
  }

  // ── Warehouse actions ────────────────────────────────

  async function handleStartPicking() {
    if (!order) return
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'picking' })
      .eq('id', order.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    loadOrder()
  }

  async function handleMarkItemPicked(itemId: string) {
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'picked' })
      .eq('id', itemId)
    if (!error) loadOrder()
  }

  async function handleMarkItemOutstanding(itemId: string) {
    const edit = outstandingEdits[itemId]
    if (!edit?.reason) { setError('Select a reason for the outstanding item.'); return }
    setError('')
    const { error } = await supabase
      .from('order_items')
      .update({
        status: 'outstanding',
        outstanding_reason: edit.reason,
        outstanding_notes: edit.notes || null,
      })
      .eq('id', itemId)
    if (!error) loadOrder()
  }

  async function handleDispatch() {
    if (!order) return
    // All items must be picked or outstanding
    const pending = order.items.filter(i => i.status === 'pending')
    if (pending.length > 0) {
      setError(`${pending.length} item(s) still pending. Mark each as picked or outstanding first.`)
      return
    }
    setSaving(true)
    const hasOutstanding = order.items.some(i => i.status === 'outstanding')
    const { error } = await supabase
      .from('orders')
      .update({
        status: hasOutstanding ? 'outstanding' : 'dispatch',
        dispatched_at: new Date().toISOString()
      })
      .eq('id', order.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    loadOrder()
  }

  // ── Outstanding resolution (Order Team) ─────────────

  async function handleBackOrder(itemId: string) {
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'back_order' })
      .eq('id', itemId)
    if (!error) loadOrder()
  }

  async function handleCancelItem(itemId: string) {
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'cancelled' })
      .eq('id', itemId)
    if (!error) {
      // Recalculate total
      const remaining = order!.items
        .filter(i => i.id !== itemId && i.status !== 'cancelled')
        .reduce((sum, i) => sum + i.price_per_case * i.quantity_cases, 0)
      await supabase.from('orders').update({ total_amount: remaining }).eq('id', order!.id)
      loadOrder()
    }
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
  if (!order) return <div style={{ padding: 32, color: '#dc2626' }}>Order not found.</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 48px' }}>
      <button onClick={() => navigate('/orders')} style={{
        background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
        fontSize: 13, padding: '0 0 16px'
      }}>← Back to Queue</button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
            {order.order_number}
          </h2>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            🏢 {order.client_account?.company_name} · 📍 {order.building?.name}
            {order.po_number && ` · PO: ${order.po_number}`}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            Delivery: {new Date(order.desired_delivery_date + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        {/* Print button */}
        {['open','picking','dispatch','outstanding','transit','delivered'].includes(order.status) && (
          <button onClick={() => window.print()} style={{
            padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0',
            borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151'
          }}>🖨 Print</button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Items table */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#374151' }}>
          Items ({order.items.length})
        </div>
        {order.items.map(item => (
          <div key={item.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                  {item.brand?.brand_name}
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{item.brand?.brand_code}</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {item.quantity_cases} case{item.quantity_cases !== 1 ? 's' : ''} × €{item.price_per_case.toFixed(2)} = <strong>€{item.subtotal.toFixed(2)}</strong>
                </div>
                {/* Item status badge */}
                {item.status !== 'pending' && (
                  <div style={{ marginTop: 6 }}>
                    <ItemStatusBadge status={item.status} />
                    {item.outstanding_reason && (
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                        {item.outstanding_reason.replace('_', ' ')}
                        {item.outstanding_notes && ` — ${item.outstanding_notes}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Warehouse: picking actions */}
              {isOperator && order.status === 'picking' && item.status === 'pending' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 12, minWidth: 160 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={outstandingEdits[item.id]?.reason ?? ''}
                      onChange={e => setOutstandingEdits(prev => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], reason: e.target.value as OutstandingReason }
                      }))}
                      style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
                    >
                      <option value="">Issue...</option>
                      {OUTSTANDING_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {outstandingEdits[item.id]?.reason && (
                    <input
                      placeholder="Notes (optional)"
                      value={outstandingEdits[item.id]?.notes ?? ''}
                      onChange={e => setOutstandingEdits(prev => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], notes: e.target.value }
                      }))}
                      style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleMarkItemPicked(item.id)} style={{
                      flex: 1, padding: '6px', background: '#dcfce7', border: '1px solid #86efac',
                      borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#166534', cursor: 'pointer'
                    }}>✓ Picked</button>
                    {outstandingEdits[item.id]?.reason && (
                      <button onClick={() => handleMarkItemOutstanding(item.id)} style={{
                        flex: 1, padding: '6px', background: '#fee2e2', border: '1px solid #fca5a5',
                        borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#991b1b', cursor: 'pointer'
                      }}>! Outstanding</button>
                    )}
                  </div>
                </div>
              )}

              {/* Order Team: resolve outstanding items */}
              {isOrderTeam && item.status === 'outstanding' && order.status === 'outstanding' && (
                <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                  <button onClick={() => handleBackOrder(item.id)} style={{
                    padding: '6px 12px', background: '#fef3c7', border: '1px solid #fcd34d',
                    borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#92400e', cursor: 'pointer'
                  }}>Back Order</button>
                  <button onClick={() => handleCancelItem(item.id)} style={{
                    padding: '6px 12px', background: '#fee2e2', border: '1px solid #fca5a5',
                    borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#991b1b', cursor: 'pointer'
                  }}>Cancel Item</button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Total row */}
        <div style={{ padding: '12px 16px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, color: '#374151' }}>Total</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1d4ed8' }}>
            €{Number(order.total_amount).toFixed(2)}
          </span>
        </div>
      </div>

      {order.notes && (
        <div style={{ padding: '12px 16px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, fontSize: 13, color: '#713f12', marginBottom: 20 }}>
          📝 <strong>Notes:</strong> {order.notes}
        </div>
      )}

      {/* Action buttons by status + role */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* Order Team: confirm open_prep → open */}
        {isOrderTeam && order.status === 'open_prep' && (
          <button onClick={handleConfirmSendToWarehouse} disabled={saving} style={{
            padding: '11px 24px', background: '#2563eb', color: 'white', border: 'none',
            borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1
          }}>
            ✓ Confirm & Send to Warehouse
          </button>
        )}

        {/* Warehouse: start picking */}
        {isOperator && order.status === 'open' && (
          <button onClick={handleStartPicking} disabled={saving} style={{
            padding: '11px 24px', background: '#7c3aed', color: 'white', border: 'none',
            borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            Start Picking
          </button>
        )}

        {/* Warehouse: dispatch */}
        {isOperator && order.status === 'picking' && (
          <button onClick={handleDispatch} disabled={saving} style={{
            padding: '11px 24px', background: '#059669', color: 'white', border: 'none',
            borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            Dispatch Order
          </button>
        )}

        {/* Order Team: mark transit (after dispatch or outstanding resolved) */}
        {isOrderTeam && ['dispatch', 'outstanding'].includes(order.status) && (
          <button onClick={handleMarkTransit} disabled={saving} style={{
            padding: '11px 24px', background: '#0891b2', color: 'white', border: 'none',
            borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            Mark as In Transit
          </button>
        )}
      </div>
    </div>
  )
}

function ItemStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending:     { bg: '#f1f5f9', color: '#64748b', label: 'Pending' },
    picked:      { bg: '#dcfce7', color: '#166534', label: '✓ Picked' },
    outstanding: { bg: '#fee2e2', color: '#991b1b', label: '! Outstanding' },
    back_order:  { bg: '#fef3c7', color: '#92400e', label: 'Back Order' },
    cancelled:   { bg: '#f1f5f9', color: '#94a3b8', label: 'Cancelled' },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <span style={{
      background: c.bg, color: c.color, fontSize: 10, fontWeight: 700,
      padding: '2px 8px', borderRadius: 99
    }}>{c.label}</span>
  )
}
```

- [ ] **Step 2: Wire route in App.tsx**

```tsx
import OrderDetail from './pages/Orders/OrderDetail'
// Replace the placeholder:
<Route path="orders/:id" element={<OrderDetail />} />
```

- [ ] **Step 3: Test the full order lifecycle manually**

1. Client submits order (Phase 2 flow) → appears in queue as "Pending Review"
2. Admin/Manager clicks order → "Confirm & Send to Warehouse"
3. Operator opens order → "Start Picking" → mark items picked/outstanding → "Dispatch Order"
4. If outstanding items → order moves to "Action Needed" → Order Team resolves (Back Order / Cancel)
5. Order Team clicks "Mark as In Transit"
6. Client sees status update in My Orders (Phase 2)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Orders/OrderDetail.tsx src/App.tsx
git commit -m "feat(orders): add OrderDetail — full lifecycle actions for Order Team + Warehouse"
```

---

### Task 16: PDF Print Layout

**Files:**
- Create: `src/pages/Orders/OrderPrint.tsx`
- Modify: `src/pages/Orders/OrderDetail.tsx` (update print button)

- [ ] **Step 1: Create print stylesheet**

Add print styles to the project. Create `src/pages/Orders/orderPrint.css`:

```css
@media print {
  body * { visibility: hidden; }
  #order-print-area, #order-print-area * { visibility: visible; }
  #order-print-area { position: absolute; top: 0; left: 0; width: 100%; }
  @page { size: A4 portrait; margin: 16mm; }
}
```

- [ ] **Step 2: Create OrderPrint component**

```tsx
// src/pages/Orders/OrderPrint.tsx
import './orderPrint.css'
import type { OrderWithDetails } from '../../types/orders'

interface OrderPrintProps {
  order: OrderWithDetails
}

export default function OrderPrint({ order }: OrderPrintProps) {
  const printDate = new Date().toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
  const deliveryDate = new Date(order.desired_delivery_date + 'T12:00:00').toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div id="order-print-area" style={{ display: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #1e293b' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>NEXT CHAIN</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Order Confirmation</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#374151' }}>
          <div><strong>Order:</strong> {order.order_number}</div>
          {order.po_number && <div><strong>PO:</strong> {order.po_number}</div>}
          <div><strong>Printed:</strong> {printDate}</div>
        </div>
      </div>

      {/* Client info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4, letterSpacing: '0.05em' }}>DELIVER TO</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{order.client_account?.company_name}</div>
          <div style={{ fontSize: 12, color: '#374151' }}>{order.building?.name}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{order.building?.address}</div>
          {order.building?.delivery_instructions && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚠ {order.building.delivery_instructions}</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4, letterSpacing: '0.05em' }}>DELIVERY DATE</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{deliveryDate}</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 16, letterSpacing: '0.05em' }}>ORDER STATUS</div>
          <div style={{ fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>{order.status.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#1e293b', color: 'white' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Code</th>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Product</th>
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Cases</th>
            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit Price</th>
            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={item.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{item.brand?.brand_code}</td>
              <td style={{ padding: '8px 10px' }}>{item.brand?.brand_name}</td>
              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{item.quantity_cases}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>€{item.price_per_case.toFixed(2)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>€{item.subtotal.toFixed(2)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10 }}>
                {item.status === 'cancelled' ? '✗ Cancelled' :
                 item.status === 'back_order' ? '⟳ Back Order' :
                 item.status === 'outstanding' ? '! Outstanding' :
                 item.status === 'picked' ? '✓' : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #1e293b' }}>
            <td colSpan={4} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>Total</td>
            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, fontSize: 14 }}>€{Number(order.total_amount).toFixed(2)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {order.notes && (
        <div style={{ fontSize: 11, color: '#374151', marginBottom: 32 }}>
          <strong>Notes:</strong> {order.notes}
        </div>
      )}

      {/* Signature */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 48 }}>
        <div>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: 10, color: '#94a3b8' }}>
            Received by (signature + date)
          </div>
        </div>
        <div>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: 10, color: '#94a3b8' }}>
            Delivered by (signature + date)
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Integrate into OrderDetail**

In `src/pages/Orders/OrderDetail.tsx`, add `OrderPrint`:

```tsx
import OrderPrint from './OrderPrint'

// Inside the return, after the action buttons:
{order && ['open','picking','dispatch','outstanding','transit','delivered'].includes(order.status) && (
  <OrderPrint order={order} />
)}
```

The print button already calls `window.print()`. The CSS will show only `#order-print-area` when printing.

- [ ] **Step 4: Test print**

```bash
npm run dev
```
Open an order in `open` status or later → click "🖨 Print" → browser print dialog → verify the print preview shows the correct layout with header, items table, totals, and signature lines.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Orders/OrderPrint.tsx src/pages/Orders/orderPrint.css src/pages/Orders/OrderDetail.tsx
git commit -m "feat(orders): add PDF print layout for order confirmation"
```

---

### Task 17: Build Check + Phase 3 Complete

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
All tests pass.

- [ ] **Step 2: Run full build**

```bash
npm run build
```
Zero errors.

- [ ] **Step 3: Push + create PR**

```bash
git push origin feat/order-portal
```

Open PR on GitHub: `feat/order-portal` → `main`

PR title: `feat: order portal — client portal + order lifecycle + PDF print`

PR body should include:
- Summary of 3 phases implemented
- Manual testing checklist:
  - [ ] Client can log in with username + PIN
  - [ ] Client can browse catalog (desktop grid + mobile list)
  - [ ] Client can submit order with delivery date
  - [ ] Order appears in internal queue
  - [ ] Order Team can confirm + send to warehouse
  - [ ] Warehouse can start picking, mark items, dispatch
  - [ ] Outstanding items flow works (back order / cancel)
  - [ ] Transit + delivery confirmation
  - [ ] PDF print renders correctly
  - [ ] All 16 automated tests pass

> ⚠️ **SQL reminder:** Before merging, confirm these SQL files have been run in Supabase:
> 1. `sql/order_portal_setup.sql`
> 2. `sql/public_holidays_ie_uk.sql`

---

## Phase 3 Complete ✓

The complete Order Portal is implemented:
- **Phase 1:** Database, auth, routing
- **Phase 2:** Client portal (catalog, cart, orders)
- **Phase 3:** Internal orders module (queue, detail, actions, PDF)

**Note:** Admin client management UI (creating client accounts, assigning buildings, catalogs, prices) was scoped to post-pilot. Admins can manage these directly in Supabase or via a follow-up plan.
