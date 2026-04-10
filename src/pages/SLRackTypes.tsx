import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

interface RackType {
  id: string
  name: string
  description: string | null
  active: boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #e4e4e7', background: '#fafafa',
  color: '#09090b', fontSize: 13, outline: 'none',
  transition: 'border-color 0.12s',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
}

const thStyle: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left',
  fontSize: 10, fontWeight: 700, color: '#a1a1aa',
  letterSpacing: '0.1em', textTransform: 'uppercase',
  borderBottom: '1px solid #e4e4e7', background: '#fafafa',
}

const tdStyle: React.CSSProperties = {
  padding: '11px 14px', borderBottom: '1px solid #f4f4f5',
  fontSize: 13, color: '#3f3f46', verticalAlign: 'middle',
}

export function SLRackTypes() {
  const { addToast } = useToast()
  const [records, setRecords] = useState<RackType[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<RackType | null>(null)
  const [deleting, setDeleting] = useState<RackType | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('rack_types')
      .select('id, name, description, active')
      .eq('active', true)
      .order('name')
    if (!error) setRecords(data ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '' })
    setShowModal(true)
  }

  function openEdit(r: RackType) {
    setEditing(r)
    setForm({ name: r.name, description: r.description ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    const name = form.name.trim()
    if (!name) { addToast('Name is required', 'error'); return }

    const duplicate = records.some(r => r.name.toLowerCase() === name.toLowerCase() && r.id !== editing?.id)
    if (duplicate) { addToast('This name already exists', 'error'); return }

    const payload = { name, description: form.description.trim() || null }
    if (editing) {
      const { error } = await supabase.from('rack_types').update(payload).eq('id', editing.id)
      if (error) { addToast('Error saving changes', 'error'); return }
      addToast('Rack Type updated', 'success')
    } else {
      const { error } = await supabase.from('rack_types').insert(payload)
      if (error) { addToast('Error creating record', 'error'); return }
      addToast('Rack Type created', 'success')
    }
    setShowModal(false)
    void load()
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('rack_types').update({ active: false }).eq('id', deleting.id)
    if (error) { addToast('Error deleting', 'error'); return }
    addToast('Rack Type removed', 'info')
    setDeleting(null)
    void load()
  }

  function ActionBtn({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
    return (
      <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '3px 5px', display: 'inline-flex', alignItems: 'center' }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = color)}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#a1a1aa')}
      >{children}</button>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: '#a1a1aa' }}>{records.length} record(s)</p>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#09090b', border: 'none',
          color: '#fff', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
        }}>
          <Plus size={13} /> Add Rack Type
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e4e4e7', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ width: 20, height: 20, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sl-spin 0.8s linear infinite', display: 'inline-block' }} />
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#a1a1aa', fontSize: 13 }}>
            No rack types yet. Click "Add Rack Type" to create one.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 500, color: '#09090b' }}>{r.name}</td>
                  <td style={{ ...tdStyle, color: '#71717a' }}>{r.description ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <ActionBtn onClick={() => openEdit(r)} color="#2563eb"><Edit2 size={13} /></ActionBtn>
                    <ActionBtn onClick={() => setDeleting(r)} color="#dc2626"><Trash2 size={13} /></ActionBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 400, background: '#fff', border: '1px solid #e4e4e7' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{editing ? 'Edit Rack Type' : 'New Rack Type'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Drinks, Snack & Crisps, Fridge & Dairy"
                  style={inputStyle} autoFocus
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
              </div>
              <div>
                <label style={labelStyle}>Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Brief description of this rack type..."
                  style={{ ...inputStyle, resize: 'none' }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500 }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: '8px 20px', background: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 360, background: '#fff', border: '1px solid #e4e4e7', padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#09090b', marginBottom: 8 }}>Remove Rack Type?</p>
            <p style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>
              <strong style={{ color: '#09090b' }}>{deleting.name}</strong> will be deactivated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleting(null)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: '8px 20px', background: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
