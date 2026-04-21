import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Edit2, Lock, Power, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBrandBarcodes } from '@/lib/useBrandBarcodes'
import { useSystemSettings } from '@/lib/useSystemSettings'
import { calcUnitPrice, formatPrice } from '@/lib/priceUtils'

export interface BrandFull {
  id: string
  brand_code: string
  brand_name: string
  is_active: boolean
  category_id: string
  category1_id: string
  sku_type_id: string
  bpu: number
  pallet_size: number | null
  image1_url: string | null
  image2_url: string | null
  image3_url: string | null
  notes: string | null
  // Commercial
  purchase_price: number | null
  wholesale_price_outer: number | null
  vending_price: number | null
  allowed_wholesale: boolean
  wholesale_units_allowed: boolean
  allowed_vending: boolean
  is_consumable: boolean
  is_non_stockable: boolean
  is_gluten_free: boolean
  is_vegan_friendly: boolean
  hse_suitable: boolean
  // Logistics
  case_weight: number | null
  case_height: number | null
  case_length: number | null
  case_depth: number | null
  product_weight: number | null
  kcal: number | null
  // Nested lookups
  category: { id: string; name: string } | null
  category1: { id: string; name: string } | null
  sku_type: { id: string; name: string; code: string } | null
}

interface Props {
  brand: BrandFull | null
  onEdit: () => void
  onRefresh: () => void
  onDelete: () => void
  onNotifyAdmin: () => void
}

const keyStyle: React.CSSProperties = {
  color: '#a1a1aa', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  flexShrink: 0,
}

const valStyle: React.CSSProperties = {
  color: '#09090b', fontWeight: 500, fontSize: 13,
  textAlign: 'right',
}

export function INVDetailPanel({ brand, onEdit, onRefresh, onDelete, onNotifyAdmin }: Props) {
  const { profile } = useAuth()
  const { addToast } = useToast()
  const isAdmin = profile?.role?.toLowerCase() === 'admin'
  console.debug('[INVDetailPanel] profile role received:', profile?.role, '| isAdmin:', isAdmin)
  const [imgIdx, setImgIdx] = useState(0)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [detailTab, setDetailTab] = useState<'info' | 'commercial' | 'logistics' | 'barcodes'>('info')
  const settings = useSystemSettings()
  const sym = settings?.currencySymbol ?? '€'
  const { barcodes: brandBarcodes, loading: barcodesLoading } = useBrandBarcodes(
    detailTab === 'barcodes' ? (brand?.id ?? null) : null
  )

  useEffect(() => {
    setImgIdx(0)
    setNotes(brand?.notes ?? '')
    setDetailTab('info')
  }, [brand?.id])

  if (!brand) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
        <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.2 }}>☰</div>
        <span style={{ fontSize: 12 }}>Select a brand to view details</span>
      </div>
    )
  }

  const images = [brand.image1_url, brand.image2_url, brand.image3_url].filter(Boolean) as string[]
  const idx = Math.min(imgIdx, Math.max(0, images.length - 1))

  async function saveNotes() {
    setSavingNotes(true)
    const { error } = await supabase.from('brands').update({ notes: notes.trim() || null }).eq('id', brand!.id)
    setSavingNotes(false)
    if (error) { addToast('Error saving notes', 'error'); return }
    addToast('Notes saved', 'success')
    onRefresh()
  }

  async function toggleStatus() {
    setTogglingStatus(true)
    const { error } = await supabase.from('brands').update({ is_active: !brand!.is_active }).eq('id', brand!.id)
    setTogglingStatus(false)
    if (error) { addToast('Error updating status', 'error'); return }
    addToast(brand!.is_active ? 'Brand deactivated' : 'Brand activated', 'info')
    onRefresh()
  }

  const notesChanged = notes !== (brand.notes ?? '')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Image carousel */}
      <div style={{ flexShrink: 0, height: 170, background: '#f4f4f5', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e4e4e7' }}>
        {images.length > 0 ? (
          <>
            <img
              src={images[idx]}
              alt="Brand"
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.9)', border: '1px solid #e4e4e7', cursor: idx === 0 ? 'default' : 'pointer', padding: '4px 5px', display: 'flex', opacity: idx === 0 ? 0.3 : 1 }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))}
                  disabled={idx === images.length - 1}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.9)', border: '1px solid #e4e4e7', cursor: idx === images.length - 1 ? 'default' : 'pointer', padding: '4px 5px', display: 'flex', opacity: idx === images.length - 1 ? 0.3 : 1 }}
                >
                  <ChevronRight size={14} />
                </button>
                <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {images.map((_, i) => (
                    <div
                      key={i}
                      onClick={() => setImgIdx(i)}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? '#2563eb' : '#d4d4d8', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: '#a1a1aa' }}>No images</span>
        )}
      </div>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: '1px solid #e4e4e7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            background: brand.is_active ? '#dcfce7' : '#f4f4f5',
            color: brand.is_active ? '#16a34a' : '#71717a',
          }}>
            {brand.is_active ? 'ACTIVE' : 'INACTIVE'}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#71717a', background: '#f4f4f5', padding: '2px 8px', letterSpacing: '0.05em' }}>
            {brand.brand_code}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b' }}>{brand.brand_name}</div>
      </div>

      {/* Sub-tab bar */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid #e4e4e7', background: '#fafafa' }}>
        {(['info', 'commercial', 'logistics', 'barcodes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setDetailTab(t)}
            style={{
              padding: '7px 11px', fontSize: 10, fontWeight: 700,
              background: 'none', border: 'none',
              borderBottom: detailTab === t ? '2px solid #09090b' : '2px solid transparent',
              marginBottom: -1,
              color: detailTab === t ? '#09090b' : '#a1a1aa',
              cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            {t === 'info' ? 'Info' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── INFO TAB ──────────────────────────────────────────────────────── */}
      {detailTab === 'info' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0' }}>
          {[
            { label: 'Category',    value: brand.category?.name ?? '—' },
            { label: 'Subcategory', value: brand.category1?.name ?? '—' },
            { label: 'SKU Type',    value: brand.sku_type ? `${brand.sku_type.name} (${brand.sku_type.code})` : '—' },
            { label: 'BPU',         value: String(brand.bpu) },
            { label: 'Pallet Size', value: brand.pallet_size != null ? String(brand.pallet_size) : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f4f4f5', gap: 16 }}>
              <span style={keyStyle}>{label}</span>
              <span style={valStyle}>{value}</span>
            </div>
          ))}

          {/* Notes */}
          <div style={{ padding: '10px 0' }}>
            <div style={{ ...keyStyle, marginBottom: 6, display: 'block' }}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes..."
              style={{
                width: '100%', padding: '7px 9px',
                border: '1px solid #e4e4e7', background: '#fafafa',
                fontSize: 12, color: '#09090b', resize: 'none', outline: 'none',
                fontFamily: 'inherit',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
            />
            {notesChanged && (
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <Save size={11} /> {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── COMMERCIAL TAB ───────────────────────────────────────────────── */}
      {detailTab === 'commercial' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Flags */}
          <div>
            <div style={{ ...keyStyle, display: 'block', marginBottom: 8 }}>Flags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {([
                { key: 'allowed_wholesale',       label: 'Wholesale' },
                { key: 'wholesale_units_allowed', label: 'Loose Units' },
                { key: 'allowed_vending',         label: 'Vending' },
                { key: 'is_consumable',           label: 'Consumable' },
                { key: 'is_non_stockable',        label: 'Non-Stockable' },
                { key: 'is_gluten_free',          label: 'Gluten Free' },
                { key: 'is_vegan_friendly',       label: 'Vegan' },
                { key: 'hse_suitable',            label: 'HSE' },
              ] as { key: keyof BrandFull; label: string }[]).map(({ key, label }) => {
                const val = brand[key] as boolean
                return (
                  <span
                    key={key}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: val ? '#dcfce7' : '#f4f4f5',
                      color: val ? '#16a34a' : '#a1a1aa',
                    }}
                  >
                    {label} {val ? '✓' : '—'}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Pricing */}
          <div>
            <div style={{ ...keyStyle, display: 'block', marginBottom: 8 }}>Pricing</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                {
                  label: 'Purchase (SKU)',
                  price: brand.purchase_price,
                  unitPrice: calcUnitPrice(brand.purchase_price, brand.bpu),
                },
                {
                  label: 'Wholesale (outer)',
                  price: brand.wholesale_price_outer,
                  unitPrice: calcUnitPrice(brand.wholesale_price_outer, brand.bpu),
                },
                {
                  label: 'Vending (unit)',
                  price: brand.vending_price,
                  unitPrice: null,
                },
              ].map(({ label, price, unitPrice }) => (
                <div
                  key={label}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}
                >
                  <span style={{ fontSize: 11, color: '#71717a' }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>{formatPrice(price, sym)}</span>
                    {unitPrice !== null && (
                      <span style={{ fontSize: 10, color: '#a1a1aa' }}>{formatPrice(unitPrice, sym)}/unit</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LOGISTICS TAB ────────────────────────────────────────────────── */}
      {detailTab === 'logistics' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Case */}
          <div>
            <div style={{ ...keyStyle, display: 'block', marginBottom: 6 }}>Case</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Weight</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
                  {brand.case_weight != null ? `${brand.case_weight} kg` : '—'}
                </div>
              </div>
              <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Volume</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
                  {brand.case_height != null && brand.case_length != null && brand.case_depth != null
                    ? `${Math.round(brand.case_height * brand.case_length * brand.case_depth).toLocaleString()} cm³`
                    : '—'}
                </div>
              </div>
              <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3, gridColumn: 'span 2' }}>
                <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Dimensions (H × L × D)</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
                  {brand.case_height != null && brand.case_length != null && brand.case_depth != null
                    ? `${brand.case_height} × ${brand.case_length} × ${brand.case_depth} cm`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Product */}
          <div>
            <div style={{ ...keyStyle, display: 'block', marginBottom: 6 }}>Product (unit)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Weight</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
                  {brand.product_weight != null ? `${brand.product_weight} kg` : '—'}
                </div>
              </div>
              <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>kcal / unit</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
                  {brand.kcal != null ? `${brand.kcal} kcal` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BARCODES TAB ─────────────────────────────────────────────────── */}
      {detailTab === 'barcodes' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {barcodesLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#a1a1aa', fontSize: 12 }}>Loading...</div>
          ) : brandBarcodes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#a1a1aa', fontSize: 12 }}>No barcodes</div>
          ) : (
            <>
              <div style={{ ...keyStyle, display: 'block', marginBottom: 8 }}>{brandBarcodes.length} barcode{brandBarcodes.length !== 1 ? 's' : ''}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {brandBarcodes.map(bc => (
                  <div key={bc} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#3f3f46', letterSpacing: '0.04em', padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
                    {bc}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #e4e4e7', display: 'flex', gap: 8 }}>
        <button
          onClick={onEdit}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          <Edit2 size={12} /> Edit
        </button>
        <button
          onClick={toggleStatus}
          disabled={togglingStatus}
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px',
            background: 'none',
            border: `1px solid ${brand.is_active ? '#fca5a5' : '#86efac'}`,
            color: brand.is_active ? '#dc2626' : '#16a34a',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Power size={12} /> {brand.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      {/* Permanent delete — admin executes, others can request via notification */}
      <div style={{ flexShrink: 0, padding: '0 16px 14px' }}>
        {isAdmin ? (
          <button
            onClick={onDelete}
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', background: 'none', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.03em' }}
          >
            <Trash2 size={11} /> Delete Permanently
          </button>
        ) : (
          <button
            onClick={onNotifyAdmin}
            title="You don't have permission to delete. Click to notify an admin."
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', background: 'none', border: '1px solid #d4d4d8', color: '#a1a1aa', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.03em' }}
          >
            <Lock size={11} /> <Trash2 size={11} /> Delete Permanently
          </button>
        )}
      </div>
    </div>
  )
}
