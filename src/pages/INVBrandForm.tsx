import { useState, useEffect } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import type { BrandFull } from './INVDetailPanel'
import { shouldResetSubcategory } from '@/lib/categoryValidation'
import { useSystemSettings } from '@/lib/useSystemSettings'
import { calcSuggestedPrice, calcUnitPrice, formatPrice } from '@/lib/priceUtils'

interface Category {
  id: string
  name: string
  parent_id: string | null
}

interface SkuType {
  id: string
  name: string
  code: string
}

interface Props {
  brand: BrandFull | null
  existingCodes: string[]
  onClose: () => void
  onSaved: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #e4e4e7', background: '#fafafa',
  color: '#09090b', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5,
}

export function INVBrandForm({ brand, existingCodes, onClose, onSaved }: Props) {
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [skuTypes, setSkuTypes] = useState<SkuType[]>([])

  useEffect(() => {
    async function fetchLookups() {
      const [{ data: cats }, { data: skus }] = await Promise.all([
        supabase.from('categories').select('id, name, parent_id').eq('active', true).order('name'),
        supabase.from('sku_types').select('id, name, code').eq('active', true).order('name'),
      ])
      setCategories(cats ?? [])
      setSkuTypes(skus ?? [])
    }
    void fetchLookups()
  }, [])

  const [form, setForm] = useState({
    is_active: brand?.is_active ?? true,
    brand_code: brand?.brand_code ?? '',
    brand_name: brand?.brand_name ?? '',
    category_id: brand?.category_id ?? '',
    category1_id: brand?.category1_id ?? '',
    sku_type_id: brand?.sku_type_id ?? '',
    bpu: brand?.bpu != null ? String(brand.bpu) : '',
    pallet_size: brand?.pallet_size != null ? String(brand.pallet_size) : '',
    notes: brand?.notes ?? '',
  })

  const [images, setImages] = useState<(string | null)[]>([
    brand?.image1_url ?? null,
    brand?.image2_url ?? null,
    brand?.image3_url ?? null,
  ])

  const [uploading, setUploading] = useState([false, false, false])

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'basic' | 'commercial' | 'logistics' | 'barcodes'>('basic')

  // Commercial form state
  const [commercial, setCommercial] = useState({
    purchase_price:          brand?.purchase_price         != null ? String(brand.purchase_price)         : '',
    wholesale_price_outer:   brand?.wholesale_price_outer  != null ? String(brand.wholesale_price_outer)  : '',
    vending_price:           brand?.vending_price          != null ? String(brand.vending_price)           : '',
    allowed_wholesale:       brand?.allowed_wholesale       ?? false,
    wholesale_units_allowed: brand?.wholesale_units_allowed ?? false,
    allowed_vending:         brand?.allowed_vending         ?? false,
    is_consumable:           brand?.is_consumable           ?? false,
    is_non_stockable:        brand?.is_non_stockable        ?? false,
    is_gluten_free:          brand?.is_gluten_free          ?? false,
    is_vegan_friendly:       brand?.is_vegan_friendly       ?? false,
    hse_suitable:            brand?.hse_suitable            ?? false,
  })

  // Logistics form state
  const [logistics, setLogistics] = useState({
    case_weight:    brand?.case_weight    != null ? String(brand.case_weight)    : '',
    case_height:    brand?.case_height    != null ? String(brand.case_height)    : '',
    case_length:    brand?.case_length    != null ? String(brand.case_length)    : '',
    case_depth:     brand?.case_depth     != null ? String(brand.case_depth)     : '',
    product_weight: brand?.product_weight != null ? String(brand.product_weight) : '',
    kcal:           brand?.kcal           != null ? String(brand.kcal)           : '',
  })

  // Barcode state
  const [localBarcodes, setLocalBarcodes]       = useState<string[]>([])
  const [originalBarcodes, setOriginalBarcodes] = useState<string[]>([])
  const [barcodeInput, setBarcodeInput]         = useState('')
  const [barcodeError, setBarcodeError]         = useState('')

  const topCategories = categories.filter(c => !c.parent_id)
  const subCategories = categories.filter(c => c.parent_id === form.category_id)

  useEffect(() => {
    if (shouldResetSubcategory(form.category1_id, form.category_id, categories)) {
      setForm(f => ({ ...f, category1_id: '' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category_id])

  useEffect(() => {
    if (!brand?.id) return
    supabase
      .from('brand_barcodes')
      .select('barcode')
      .eq('brand_id', brand.id)
      .order('created_at')
      .then(({ data }) => {
        const codes = data?.map(r => r.barcode) ?? []
        setLocalBarcodes(codes)
        setOriginalBarcodes(codes)
      })
  }, [brand?.id])

  const settings = useSystemSettings()
  const sym = settings?.currencySymbol ?? '€'
  const wMargins = settings?.wholesaleMargins ?? [35, 40, 45]
  const vMargins = settings?.vendingMargins   ?? [50, 60, 65]

  async function uploadImage(slot: number, file: File) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    setUploading(u => u.map((v, i) => i === slot ? true : v))

    const { error: upErr } = await supabase.storage.from('items_images').upload(path, file)
    if (upErr) {
      setUploading(u => u.map((v, i) => i === slot ? false : v))
      addToast(`Upload error: ${upErr.message}`, 'error')
      console.error('Storage upload error:', upErr)
      return
    }

    const { data } = supabase.storage.from('items_images').getPublicUrl(path)
    setImages(imgs => imgs.map((v, i) => i === slot ? data.publicUrl : v))
    setUploading(u => u.map((v, i) => i === slot ? false : v))
  }

  async function removeImage(slot: number) {
    const url = images[slot]
    if (url) {
      const parts = url.split('/object/public/brands/')
      if (parts[1]) await supabase.storage.from('items_images').remove([parts[1]])
    }
    setImages(imgs => imgs.map((v, i) => i === slot ? null : v))
  }

  async function handleSave() {
    const brand_code = form.brand_code.trim().toUpperCase()
    const brand_name = form.brand_name.trim()

    if (!brand_code) { addToast('Brand code is required', 'error'); return }
    if (!brand_name) { addToast('Brand name is required', 'error'); return }
    if (!form.category_id) { addToast('Category is required', 'error'); return }
    if (!form.category1_id) { addToast('Subcategory is required', 'error'); return }
    if (!form.sku_type_id) { addToast('SKU Type is required', 'error'); return }
    if (!form.bpu || isNaN(parseInt(form.bpu))) { addToast('BPU is required', 'error'); return }

    const dupCode = existingCodes.some(c => c.toUpperCase() === brand_code && c !== brand?.brand_code)
    if (dupCode) { addToast('Brand code already exists', 'error'); return }

    setSaving(true)
    const payload = {
      brand_code,
      brand_name,
      is_active: form.is_active,
      category_id: form.category_id,
      category1_id: form.category1_id,
      sku_type_id: form.sku_type_id,
      bpu: parseInt(form.bpu),
      pallet_size: form.pallet_size ? parseInt(form.pallet_size) : null,
      notes: form.notes.trim() || null,
      image1_url: images[0],
      image2_url: images[1],
      image3_url: images[2],
    }

    let error
    if (brand) {
      ;({ error } = await supabase.from('brands').update(payload).eq('id', brand.id))
    } else {
      ;({ error } = await supabase.from('brands').insert(payload))
    }

    setSaving(false)
    if (error) { addToast('Error saving brand', 'error'); return }
    addToast(brand ? 'Brand updated' : 'Brand created', 'success')
    onSaved()
  }

  // Computed derived values for display
  const purchaseNum  = parseFloat(commercial.purchase_price)  || null
  const wholesaleNum = parseFloat(commercial.wholesale_price_outer) || null
  const bpuNum       = parseInt(form.bpu) || 0

  const unitPurchase  = calcUnitPrice(purchaseNum, bpuNum)
  const unitWholesale = calcUnitPrice(wholesaleNum, bpuNum)

  const TAB_STYLE_ACTIVE: React.CSSProperties = {
    padding: '9px 16px', fontSize: 11, fontWeight: 700, background: 'none',
    border: 'none', borderBottom: '3px solid #09090b', marginBottom: -2,
    color: '#09090b', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase',
  }
  const TAB_STYLE_INACTIVE: React.CSSProperties = {
    ...TAB_STYLE_ACTIVE, borderBottom: '3px solid transparent', color: '#a1a1aa',
  }

  function tabStyle(tab: typeof activeTab) {
    return activeTab === tab ? TAB_STYLE_ACTIVE : TAB_STYLE_INACTIVE
  }

  function addBarcode() {
    const val = barcodeInput.trim()
    if (!val) return
    if (localBarcodes.includes(val)) {
      setBarcodeError('Barcode already in this list')
      return
    }
    setLocalBarcodes(bs => [...bs, val])
    setBarcodeInput('')
    setBarcodeError('')
  }

  // suppress unused variable warnings for barcode state
  void originalBarcodes

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 580, background: '#fff', border: '1px solid #e4e4e7', marginTop: 16 }}>

        {/* Modal header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{brand ? 'Edit Brand' : 'New Brand'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e4e4e7', paddingLeft: 24 }}>
          {(['basic', 'commercial', 'logistics', 'barcodes'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>
              {t === 'basic' ? 'Basic Info' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>

          {/* ── BASIC INFO TAB ──────────────────────────────────────────────── */}
          {activeTab === 'basic' && (
            <>
              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', border: '1px solid #e4e4e7', marginBottom: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#52525b' }}>Active Brand</span>
                <button
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  style={{ width: 40, height: 22, borderRadius: 11, background: form.is_active ? '#2563eb' : '#d4d4d8', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
                >
                  <div style={{ position: 'absolute', top: 3, left: form.is_active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </button>
              </div>

              {/* Brand Code + Brand Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Brand Code *</label>
                  <input
                    list="inv-brand-codes"
                    value={form.brand_code}
                    onChange={e => setForm(f => ({ ...f, brand_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. COCA"
                    style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em' }}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                  />
                  <datalist id="inv-brand-codes">
                    {existingCodes.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>Brand Name *</label>
                  <input
                    value={form.brand_name}
                    onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                    placeholder="e.g. Coca-Cola"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                  />
                </div>
              </div>

              {/* Category + Subcategory */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value, category1_id: '' }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">Select...</option>
                    {topCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Subcategory *</label>
                  <select
                    value={form.category1_id}
                    onChange={e => setForm(f => ({ ...f, category1_id: e.target.value }))}
                    disabled={!form.category_id}
                    style={{ ...inputStyle, cursor: form.category_id ? 'pointer' : 'default', opacity: !form.category_id ? 0.5 : 1 }}
                  >
                    <option value="">Select...</option>
                    {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* SKU Type */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>SKU Type *</label>
                <select
                  value={form.sku_type_id}
                  onChange={e => setForm(f => ({ ...f, sku_type_id: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select SKU type...</option>
                  {skuTypes.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>

              {/* BPU + Pallet Size */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>BPU (Units / Box) *</label>
                  <input
                    type="number" min="1"
                    value={form.bpu}
                    onChange={e => setForm(f => ({ ...f, bpu: e.target.value }))}
                    placeholder="e.g. 12"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Pallet Size</label>
                  <input
                    type="number" min="1"
                    value={form.pallet_size}
                    onChange={e => setForm(f => ({ ...f, pallet_size: e.target.value }))}
                    placeholder="e.g. 48"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes..."
                  style={{ ...inputStyle, resize: 'none' }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
              </div>

              {/* Images */}
              <div>
                <label style={labelStyle}>Images (up to 3)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {([0, 1, 2] as const).map(slot => (
                    <div
                      key={slot}
                      style={{ border: '1px solid #e4e4e7', background: '#fafafa', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}
                    >
                      {images[slot] ? (
                        <>
                          <img src={images[slot]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            onClick={() => removeImage(slot)}
                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(220,38,38,0.85)', border: 'none', cursor: 'pointer', color: '#fff', padding: '3px', display: 'flex' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : uploading[slot] ? (
                        <span style={{ fontSize: 11, color: '#a1a1aa' }}>Uploading...</span>
                      ) : (
                        <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#a1a1aa' }}>
                          <Upload size={18} />
                          <span style={{ fontSize: 10, fontWeight: 600 }}>Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage(slot, f) }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── COMMERCIAL TAB ──────────────────────────────────────────────── */}
          {activeTab === 'commercial' && (
            <>
              {/* Flags */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Product Flags</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {([
                    { key: 'allowed_wholesale',       label: 'Allowed Wholesale' },
                    { key: 'wholesale_units_allowed',  label: 'Loose Units Allowed', indent: true, disabledWhen: !commercial.allowed_wholesale },
                    { key: 'allowed_vending',          label: 'Allowed Vending' },
                    { key: 'is_consumable',            label: 'Consumable (Internal)' },
                    { key: 'is_non_stockable',         label: 'Non-Stockable' },
                    { key: 'is_gluten_free',           label: 'Gluten Free' },
                    { key: 'is_vegan_friendly',        label: 'Vegan Friendly' },
                    { key: 'hse_suitable',             label: 'HSE Suitable' },
                  ] as { key: keyof typeof commercial; label: string; indent?: boolean; disabledWhen?: boolean }[]).map(({ key, label, indent, disabledWhen }) => {
                    const checked = commercial[key] as boolean
                    const disabled = disabledWhen === true
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 10px',
                          background: disabled ? '#f9f9f9' : (checked ? '#eff6ff' : '#f9f9f9'),
                          border: `1px solid ${checked && !disabled ? '#bfdbfe' : '#e4e4e7'}`,
                          borderRadius: 3,
                          opacity: disabled ? 0.45 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          marginLeft: indent ? 8 : 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={e => setCommercial(c => ({ ...c, [key]: e.target.checked }))}
                          style={{ cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 11, color: checked && !disabled ? '#2563eb' : '#3f3f46', fontWeight: checked && !disabled ? 600 : 400 }}>{label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Pricing */}
              <div>
                <label style={labelStyle}>Pricing</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                  {/* Purchase Price */}
                  <div style={{ background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 4, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#3f3f46', fontWeight: 600, width: 170, flexShrink: 0 }}>Purchase Price (SKU)</span>
                      <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>{sym}</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={commercial.purchase_price}
                        onChange={e => setCommercial(c => ({ ...c, purchase_price: e.target.value }))}
                        placeholder="0.00"
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={e => (e.target.style.borderColor = '#2563eb')}
                        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                      />
                    </div>
                    {unitPurchase !== null && (
                      <div style={{ marginTop: 4, fontSize: 10, color: '#a1a1aa', paddingLeft: 178 }}>
                        Unit cost: {formatPrice(unitPurchase, sym)} ÷ BPU
                      </div>
                    )}
                  </div>

                  {/* Wholesale Price */}
                  <div style={{ background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 4, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#3f3f46', fontWeight: 600, width: 170, flexShrink: 0 }}>Wholesale Price (outer)</span>
                      <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>{sym}</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={commercial.wholesale_price_outer}
                        onChange={e => setCommercial(c => ({ ...c, wholesale_price_outer: e.target.value }))}
                        placeholder="0.00"
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={e => (e.target.style.borderColor = '#2563eb')}
                        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                      />
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 178 }}>
                      <span style={{ fontSize: 10, color: '#a1a1aa' }}>Suggest:</span>
                      {wMargins.map(m => (
                        <button
                          key={m}
                          type="button"
                          disabled={!purchaseNum}
                          onClick={() => {
                            if (!purchaseNum) return
                            const suggested = calcSuggestedPrice(purchaseNum, m)
                            if (suggested !== null) setCommercial(c => ({ ...c, wholesale_price_outer: String(suggested) }))
                          }}
                          style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 3, cursor: purchaseNum ? 'pointer' : 'not-allowed', opacity: purchaseNum ? 1 : 0.4 }}
                        >
                          {m}%
                        </button>
                      ))}
                      {unitWholesale !== null && (
                        <span style={{ fontSize: 10, color: '#a1a1aa', marginLeft: 4 }}>Unit: {formatPrice(unitWholesale, sym)}</span>
                      )}
                    </div>
                  </div>

                  {/* Vending Price */}
                  <div style={{ background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 4, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#3f3f46', fontWeight: 600, width: 170, flexShrink: 0 }}>Vending Price (unit)</span>
                      <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>{sym}</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={commercial.vending_price}
                        onChange={e => setCommercial(c => ({ ...c, vending_price: e.target.value }))}
                        placeholder="0.00"
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={e => (e.target.style.borderColor = '#2563eb')}
                        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                      />
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 178 }}>
                      <span style={{ fontSize: 10, color: '#a1a1aa' }}>Suggest:</span>
                      {vMargins.map(m => (
                        <button
                          key={m}
                          type="button"
                          disabled={!unitPurchase}
                          onClick={() => {
                            if (!unitPurchase) return
                            const suggested = calcSuggestedPrice(unitPurchase, m)
                            if (suggested !== null) setCommercial(c => ({ ...c, vending_price: String(suggested) }))
                          }}
                          style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 8px', borderRadius: 3, cursor: unitPurchase ? 'pointer' : 'not-allowed', opacity: unitPurchase ? 1 : 0.4 }}
                        >
                          {m}%
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}

          {/* ── LOGISTICS TAB ────────────────────────────────────────────── */}
          {activeTab === 'logistics' && (
            <>
              {/* Case section */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Case Dimensions</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                  {([
                    { key: 'case_weight', label: 'Weight (kg)', step: '0.001' },
                    { key: 'case_height', label: 'Height (cm)', step: '0.01' },
                    { key: 'case_length', label: 'Length (cm)', step: '0.01' },
                    { key: 'case_depth',  label: 'Depth (cm)',  step: '0.01' },
                  ] as { key: keyof typeof logistics; label: string; step: string }[]).map(({ key, label, step }) => (
                    <div key={key}>
                      <label style={labelStyle}>{label}</label>
                      <input
                        type="number" min="0" step={step}
                        value={logistics[key]}
                        onChange={e => setLogistics(l => ({ ...l, [key]: e.target.value }))}
                        placeholder="0"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = '#2563eb')}
                        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                      />
                    </div>
                  ))}
                </div>
                {/* Auto-calculated volume */}
                {(() => {
                  const h = parseFloat(logistics.case_height)
                  const l = parseFloat(logistics.case_length)
                  const d = parseFloat(logistics.case_depth)
                  const vol = h > 0 && l > 0 && d > 0 ? (h * l * d).toFixed(0) : null
                  return vol ? (
                    <div style={{ padding: '6px 12px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3, fontSize: 11, color: '#71717a' }}>
                      Volume: <strong style={{ color: '#09090b' }}>{Number(vol).toLocaleString()} cm³</strong>
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#a1a1aa' }}>auto-calculated H × L × D</span>
                    </div>
                  ) : null
                })()}
              </div>

              {/* Product (unit) section */}
              <div>
                <label style={labelStyle}>Product (unit)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Product Weight (kg)</label>
                    <input
                      type="number" min="0" step="0.001"
                      value={logistics.product_weight}
                      onChange={e => setLogistics(l => ({ ...l, product_weight: e.target.value }))}
                      placeholder="0.000"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#2563eb')}
                      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>kcal (per unit)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={logistics.kcal}
                      onChange={e => setLogistics(l => ({ ...l, kcal: e.target.value }))}
                      placeholder="0"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#2563eb')}
                      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── BARCODES TAB ─────────────────────────────────────────────── */}
          {activeTab === 'barcodes' && (
            <>
              {/* Add barcode input */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={barcodeInput}
                  onChange={e => { setBarcodeInput(e.target.value); setBarcodeError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBarcode() } }}
                  placeholder="Enter barcode..."
                  style={{ ...inputStyle, flex: 1, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em' }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
                <button
                  type="button"
                  onClick={addBarcode}
                  style={{ padding: '8px 16px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Add
                </button>
              </div>
              {barcodeError && (
                <div style={{ marginBottom: 8, fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: 3 }}>
                  {barcodeError}
                </div>
              )}

              {/* Barcode list */}
              {localBarcodes.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#a1a1aa' }}>No barcodes yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {localBarcodes.map(bc => (
                    <div key={bc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#3f3f46', letterSpacing: '0.04em' }}>{bc}</span>
                      <button
                        type="button"
                        onClick={() => setLocalBarcodes(bs => bs.filter(b => b !== bc))}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div style={{ marginTop: 4, fontSize: 10, color: '#a1a1aa', textAlign: 'center' }}>
                    {localBarcodes.length} barcode{localBarcodes.length !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 20px', background: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Brand'}
          </button>
        </div>
      </div>
    </div>
  )
}
