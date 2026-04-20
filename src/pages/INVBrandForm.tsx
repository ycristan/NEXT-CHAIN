import { useState, useEffect } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import type { BrandFull } from './INVDetailPanel'
import { shouldResetSubcategory } from '@/lib/categoryValidation'

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

  const topCategories = categories.filter(c => !c.parent_id)
  const subCategories = categories.filter(c => c.parent_id === form.category_id)

  useEffect(() => {
    if (shouldResetSubcategory(form.category1_id, form.category_id, categories)) {
      setForm(f => ({ ...f, category1_id: '' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category_id])

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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', border: '1px solid #e4e4e7', marginTop: 16 }}>

        {/* Modal header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{brand ? 'Edit Brand' : 'New Brand'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 24 }}>

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
