import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

interface Category {
  id: string
  name: string
  parent_id: string | null
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
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '11px 14px', borderBottom: '1px solid #f4f4f5',
  fontSize: 13, color: '#3f3f46', verticalAlign: 'middle',
}

export function SLCategories() {
  const { addToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: '', parent_id: '' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, parent_id, active')
      .eq('active', true)
      .order('name')
    if (!error) setCategories(data ?? [])
    setLoading(false)
  }

  const parents = categories.filter(c => !c.parent_id)
  const getChildren = (parentId: string) => categories.filter(c => c.parent_id === parentId)

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreate(parentId?: string) {
    setEditing(null)
    setForm({ name: '', parent_id: parentId ?? '' })
    setShowModal(true)
  }

  function openEdit(c: Category) {
    setEditing(c)
    setForm({ name: c.name, parent_id: c.parent_id ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    const name = form.name.trim()
    if (!name) { addToast('Name is required', 'error'); return }
    const duplicate = categories.some(
      c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editing?.id
    )
    if (duplicate) { addToast('This name already exists', 'error'); return }

    const payload = { name, parent_id: form.parent_id || null }

    if (editing) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editing.id)
      if (error) { addToast('Error saving changes', 'error'); return }
      addToast('Category updated', 'success')
    } else {
      const { error } = await supabase.from('categories').insert(payload)
      if (error) { addToast('Error creating category', 'error'); return }
      addToast('Category created', 'success')
    }
    setShowModal(false)
    void load()
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('categories').update({ active: false }).eq('id', deleting.id)
    if (error) { addToast('Error deleting', 'error'); return }
    addToast('Category removed', 'info')
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
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: '#a1a1aa' }}>{categories.length} record(s)</p>
        <button onClick={() => openCreate()} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#09090b', border: 'none',
          color: '#fff', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
        }}>
          <Plus size={13} /> Add Category
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e4e4e7', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ width: 20, height: 20, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sl-spin 0.8s linear infinite', display: 'inline-block' }} />
          </div>
        ) : categories.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#a1a1aa', fontSize: 13 }}>
            No categories yet. Click "Add Category" to get started.
          </div>
        ) : (
          <div style={{ fontSize: 13 }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 130px', background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
              <div style={thStyle}>Name</div>
              <div style={thStyle}>Level</div>
              <div style={{ ...thStyle, textAlign: 'right' }}>Actions</div>
            </div>

            {/* Category groups */}
            {parents.map(parent => {
              const children = getChildren(parent.id)
              const isExpanded = expanded.has(parent.id)
              return (
                <div key={parent.id} style={{ borderBottom: '1px solid #e4e4e7' }}>
                  {/* Category row */}
                  <div
                    onClick={() => toggleExpanded(parent.id)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 160px 130px', background: '#fafafa', cursor: 'pointer' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f4f4f5')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#fafafa')}
                  >
                    <div style={{ ...tdStyle, fontWeight: 600, color: '#09090b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#a1a1aa', display: 'inline-flex', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                        <ChevronDown size={14} />
                      </span>
                      {parent.name}
                      {children.length > 0 && (
                        <span style={{ fontSize: 10, color: '#a1a1aa', fontWeight: 400, marginLeft: 2 }}>({children.length})</span>
                      )}
                    </div>
                    <div style={tdStyle}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px' }}>
                        CATEGORY
                      </span>
                    </div>
                    <div style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openCreate(parent.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '3px 8px', fontSize: 11, fontWeight: 600 }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#2563eb')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#a1a1aa')}
                      >+ Sub</button>
                      <ActionBtn onClick={() => openEdit(parent)} color="#2563eb"><Edit2 size={13} /></ActionBtn>
                      <ActionBtn onClick={() => setDeleting(parent)} color="#dc2626"><Trash2 size={13} /></ActionBtn>
                    </div>
                  </div>

                  {/* Subcategory accordion */}
                  <div style={{
                    maxHeight: isExpanded ? `${children.length * 46 + 4}px` : '0',
                    overflow: 'hidden',
                    transition: 'max-height 0.22s ease',
                    background: '#f9fafb',
                    borderLeft: '3px solid #e4e4e7',
                  }}>
                    {children.map(child => (
                      <div key={child.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 130px', borderTop: '1px solid #f4f4f5' }}>
                        <div style={{ ...tdStyle, paddingLeft: 32 }}>
                          <span style={{ color: '#d4d4d8', marginRight: 8 }}>└</span>
                          {child.name}
                        </div>
                        <div style={tdStyle}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#71717a', background: '#f4f4f5', padding: '2px 8px' }}>
                            SUBCATEGORY
                          </span>
                        </div>
                        <div style={{ ...tdStyle, textAlign: 'right' }}>
                          <ActionBtn onClick={() => openEdit(child)} color="#2563eb"><Edit2 size={13} /></ActionBtn>
                          <ActionBtn onClick={() => setDeleting(child)} color="#dc2626"><Trash2 size={13} /></ActionBtn>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 400, background: '#fff', border: '1px solid #e4e4e7' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{editing ? 'Edit Category' : 'New Category'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={inputStyle} autoFocus
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div>
                <label style={labelStyle}>Parent Category</label>
                <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">— Top-level (no parent) —</option>
                  {parents.filter(p => p.id !== editing?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handleSave} style={{ padding: '8px 20px', background: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 360, background: '#fff', border: '1px solid #e4e4e7', padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#09090b', marginBottom: 8 }}>Remove category?</p>
            <p style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>
              <strong style={{ color: '#09090b' }}>{deleting.name}</strong> will be deactivated.
              {!deleting.parent_id && ' Subcategories will also be removed.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleting(null)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: '8px 20px', background: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes sl-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
