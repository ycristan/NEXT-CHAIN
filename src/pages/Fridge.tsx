import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Search, AlertTriangle, Snowflake } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { PLSlotImagePreview, type HoverBrand, type PreviewHandle } from './PLSlotImagePreview'

// Module-level store — survives tab navigation
const _store: { search: string } = { search: '' }

// ── Types ───────────────────────────────────────────────────────
interface FridgeItem {
  id: string
  brand_id: string
  assigned_at: string
  bin_address: string
  brand_code: string
  brand_name: string
  bpu: number | null
  image1_url: string | null
  notes: string | null
  category_name: string | null
  category1_name: string | null
}

interface AvailableBrand {
  id: string
  brand_code: string
  brand_name: string
  category1_id: string | null
  category1_name: string | null
}

// ── Component ───────────────────────────────────────────────────
export function Fridge() {
  const { profile } = useAuth()
  const { addToast } = useToast()
  const isAdmin = profile?.role?.toLowerCase() === 'admin'

  const [items, setItems]       = useState<FridgeItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState(_store.search)

  // Add modal
  const [showAdd, setShowAdd]               = useState(false)
  const [availableBrands, setAvailableBrands] = useState<AvailableBrand[]>([])
  const [modalSearch, setModalSearch]       = useState('')
  const [modalLoading, setModalLoading]     = useState(false)
  const [adding, setAdding]                 = useState<string | null>(null)

  // Delete confirmation
  const [confirmDelete, setConfirmDelete]   = useState<FridgeItem | null>(null)
  const [deleting, setDeleting]             = useState(false)

  // Realtime flash
  const [flashedItems, setFlashedItems]     = useState<Set<string>>(new Set())

  // ── Hover preview ──────────────────────────────────────────────
  const previewRef    = useRef<PreviewHandle>(null)
  const imageCacheRef = useRef<Map<string, string | null>>(new Map())

  function handleMouseEnter(item: FridgeItem) {
    const brand: HoverBrand = { id: item.brand_id, brand_code: item.brand_code, brand_name: item.brand_name }

    if (!item.image1_url) {
      previewRef.current?.show(brand, null, false)
      return
    }

    if (imageCacheRef.current.has(item.brand_id)) {
      previewRef.current?.show(brand, imageCacheRef.current.get(item.brand_id)!, false)
      return
    }

    // image1_url already on the item — use it directly, no extra fetch needed
    const url = item.image1_url
    imageCacheRef.current.set(item.brand_id, url)
    previewRef.current?.show(brand, url, false)
  }

  function handleMouseLeave() {
    previewRef.current?.hide()
  }

  // ── Data loading ───────────────────────────────────────────────
  // silent=true: skip spinner — used by realtime & post-save refreshes.
  async function loadItems({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('fridge_items_view')
      .select('*')
      .order('brand_name')

    if (error) {
      addToast('Failed to load fridge items', 'error')
    } else {
      setItems((data ?? []) as FridgeItem[])
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => { void loadItems() }, [])

  // ── Supabase Realtime — surgical sync across tabs/users ───────────
  useEffect(() => {
    function flashItem(itemId: string) {
      setFlashedItems(prev => new Set(prev).add(itemId))
      setTimeout(() => {
        setFlashedItems(prev => { const s = new Set(prev); s.delete(itemId); return s })
      }, 1400)
    }

    async function handleFridgeChange(payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) {
      console.log('[Realtime] MUDANÇA DETECTADA (fridge_items):', payload)

      if (payload.eventType === 'INSERT') {
        const itemId = payload.new.id as string
        const { data } = await supabase
          .from('fridge_items_view')
          .select('*')
          .eq('id', itemId)
          .single()
        if (!data) return
        flashItem(itemId)
        setItems(prev => {
          // Guard against duplicates (own save + realtime fire)
          if (prev.some(i => i.id === itemId)) return prev
          return [...prev, data as FridgeItem].sort((a, b) => a.brand_name.localeCompare(b.brand_name))
        })
        return
      }

      if (payload.eventType === 'DELETE') {
        const id = payload.old.id as string | undefined
        if (id) setItems(prev => prev.filter(i => i.id !== id))
        return
      }
    }

    const channel = supabase
      .channel('fridge-realtime')
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'fridge_items' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => { void handleFridgeChange(payload) }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] fridge-realtime status:', status, err ?? '')
      })

    return () => { void supabase.removeChannel(channel) }
  }, [])

  // Persist search
  useEffect(() => { _store.search = search }, [search])

  // ── Add modal ──────────────────────────────────────────────────
  async function openAddModal() {
    setShowAdd(true)
    setModalSearch('')
    setModalLoading(true)

    // Fetch allowed category1 ids
    const { data: allowed } = await supabase
      .from('fridge_allowed_categories')
      .select('category1_id')

    const allowedIds = (allowed ?? []).map((r: { category1_id: string }) => r.category1_id)

    // Fetch brands already in fridge
    const { data: inFridge } = await supabase
      .from('fridge_items')
      .select('brand_id')

    const inFridgeIds = new Set((inFridge ?? []).map((r: { brand_id: string }) => r.brand_id))

    // Build brand query
    let q = supabase
      .from('brands')
      .select('id, brand_code, brand_name, category1_id, category1:category1_id(name)')
      .eq('is_active', true)
      .order('brand_name')

    // Apply category filter only when allow-list is non-empty
    if (allowedIds.length > 0) {
      q = q.in('category1_id', allowedIds)
    }

    const { data: brands } = await q

    const mapped: AvailableBrand[] = (brands ?? [])
      .filter((b: { id: string }) => !inFridgeIds.has(b.id))
      .map(b => ({
        id: b.id as string,
        brand_code: b.brand_code as string,
        brand_name: b.brand_name as string,
        category1_id: b.category1_id as string | null,
        category1_name: (b.category1 as unknown as { name: string } | null)?.name ?? null,
      }))

    setAvailableBrands(mapped)
    setModalLoading(false)
  }

  async function handleAddBrand(brand: AvailableBrand) {
    setAdding(brand.id)
    const { error } = await supabase
      .from('fridge_items')
      .insert({ brand_id: brand.id })

    if (error) {
      const msg = error.code === '23514'
        ? 'Category not authorised for Fridge.'
        : error.code === '23505'
        ? 'Brand is already in the Fridge.'
        : error.message
      addToast(msg, 'error')
    } else {
      addToast(`${brand.brand_name} added to Fridge`, 'success')
      setShowAdd(false)
      void loadItems({ silent: true })
    }
    setAdding(null)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error } = await supabase
      .from('fridge_items')
      .delete()
      .eq('id', confirmDelete.id)

    if (error) {
      addToast('Failed to remove item', 'error')
    } else {
      addToast(`${confirmDelete.brand_name} removed from Fridge`, 'success')
      setConfirmDelete(null)
      void loadItems({ silent: true })
    }
    setDeleting(false)
  }

  // ── Filtered list ──────────────────────────────────────────────
  const filtered = search.trim()
    ? items.filter(it =>
        it.brand_name.toLowerCase().includes(search.toLowerCase()) ||
        it.brand_code.toLowerCase().includes(search.toLowerCase()) ||
        (it.category1_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : items

  const filteredModal = modalSearch.trim()
    ? availableBrands.filter(b =>
        b.brand_name.toLowerCase().includes(modalSearch.toLowerCase()) ||
        b.brand_code.toLowerCase().includes(modalSearch.toLowerCase())
      )
    : availableBrands

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Top bar: header + toolbar left, preview right */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexShrink: 0 }}>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 3 }}>
              Operational
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px' }}>
              Fridge
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && (
              <button
                onClick={openAddModal}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                <Plus size={13} /> Add to Fridge
              </button>
            )}

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e4e4e7', background: '#fff', padding: '5px 10px', flex: 1, maxWidth: 280 }}>
              <Search size={12} color="#a1a1aa" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search brand..."
                style={{ border: 'none', outline: 'none', fontSize: 12, color: '#09090b', background: 'transparent', flex: 1, minWidth: 0 }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
              )}
            </div>

            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a1a1aa', whiteSpace: 'nowrap' }}>
              {filtered.length} / {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Hover preview widget */}
        <PLSlotImagePreview ref={previewRef} />
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e4e4e7', background: '#fafafa' }}>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ width: 18, height: 18, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'fr-spin 0.8s linear infinite' }} />
          </div>

        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
            <Snowflake size={28} strokeWidth={1} color="#a1a1aa" />
            <span style={{ fontSize: 13, color: '#a1a1aa' }}>
              {search ? 'No items match your search.' : 'No items in the Fridge yet.'}
            </span>
          </div>

        ) : (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {filtered.map(item => (
              <div
                key={item.id}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                  handleMouseEnter(item)
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none'
                  handleMouseLeave()
                }}
                style={{
                  position: 'relative',
                  background: '#fff',
                  border: '1px solid #e4e4e7',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  cursor: 'default',
                  transition: 'box-shadow 0.15s',
                }}
              >
                {/* Realtime flash overlay */}
                {flashedItems.has(item.id) && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 2,
                    pointerEvents: 'none',
                    background: 'rgba(59,130,246,0.22)',
                    animation: 'fr-flash 1.4s ease-out forwards',
                  }} />
                )}
                {/* Image area */}
                <div style={{ height: 100, background: '#f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {item.image1_url ? (
                    <img
                      src={item.image1_url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <Snowflake size={24} strokeWidth={1} color="#d4d4d8" />
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em', flexShrink: 0 }}>
                      {item.brand_code}
                    </span>
                    <span style={{ fontSize: 10, color: '#71717a', fontStyle: 'italic', textAlign: 'right' }}>
                      Fridge
                    </span>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 600, color: '#09090b', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.brand_name}
                  </div>

                  {item.category1_name && (
                    <div style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>
                      {item.category1_name}
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {item.bpu != null ? (
                      <span style={{ fontSize: 10, color: '#52525b' }}>×{item.bpu} BPU</span>
                    ) : <span />}

                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDelete(item)}
                        title="Remove from Fridge"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2, display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add modal ───────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAdd(false)}>
          <div style={{ background: '#fff', width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#09090b' }}>Add Brand to Fridge</span>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            {/* Modal search */}
            <div style={{ padding: '10px 18px', borderBottom: '1px solid #e4e4e7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e4e4e7', padding: '6px 10px' }}>
                <Search size={12} color="#a1a1aa" />
                <input
                  autoFocus
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  placeholder="Search brand code or name..."
                  style={{ border: 'none', outline: 'none', fontSize: 12, flex: 1, color: '#09090b', background: 'transparent' }}
                />
              </div>
            </div>

            {/* Brand list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {modalLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
                  <div style={{ width: 16, height: 16, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'fr-spin 0.8s linear infinite' }} />
                </div>
              ) : filteredModal.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#a1a1aa' }}>
                  {modalSearch ? 'No brands match your search.' : 'No available brands for Fridge.'}
                </div>
              ) : (
                filteredModal.map(brand => (
                  <button
                    key={brand.id}
                    onClick={() => handleAddBrand(brand)}
                    disabled={adding === brand.id}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none',
                      border: 'none', borderBottom: '1px solid #f4f4f5',
                      padding: '10px 18px', cursor: adding ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10,
                      opacity: adding && adding !== brand.id ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f4f4f5' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: '#2563eb' }}>{brand.brand_code}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#09090b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.brand_name}</span>
                      </div>
                      {brand.category1_name && (
                        <div style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>{brand.category1_name}</div>
                      )}
                    </div>
                    {adding === brand.id ? (
                      <div style={{ width: 14, height: 14, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'fr-spin 0.8s linear infinite', flexShrink: 0 }} />
                    ) : (
                      <Plus size={14} color="#a1a1aa" style={{ flexShrink: 0 }} />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !deleting && setConfirmDelete(null)}>
          <div style={{ background: '#fff', width: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b', marginBottom: 4 }}>Remove from Fridge?</div>
                <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: '#09090b' }}>{confirmDelete.brand_name}</span> will be removed from the Fridge. This action can be undone by re-allocating the brand.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                style={{ padding: '7px 16px', background: '#f4f4f5', border: '1px solid #e4e4e7', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#52525b' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ padding: '7px 16px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: deleting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {deleting ? (
                  <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'fr-spin 0.8s linear infinite' }} /> Removing…</>
                ) : (
                  <><Trash2 size={13} /> Remove</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fr-spin  { to { transform: rotate(360deg); } }
        @keyframes fr-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  )
}
