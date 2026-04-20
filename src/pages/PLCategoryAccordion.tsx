import { useRef, useEffect, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface Category { id: string; name: string; parent_id: string | null }

interface Props {
  categories: Category[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.1em',
}

interface ParentCheckboxProps {
  state: 'checked' | 'indeterminate' | 'unchecked'
  onChange: () => void
  disabled?: boolean
}

function ParentCheckbox({ state, onChange, disabled }: ParentCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      onChange={onChange}
      disabled={disabled}
      style={{ cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
    />
  )
}

export function PLCategoryAccordion({ categories, selected, onChange, disabled }: Props) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const parents  = categories.filter(c => !c.parent_id)
  const kidsOf   = (pid: string) => categories.filter(c => c.parent_id === pid)
  const allIds   = categories.map(c => c.id)
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id))

  function toggleOpen(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function parentState(parent: Category): 'checked' | 'indeterminate' | 'unchecked' {
    const kids     = kidsOf(parent.id)
    const parentIn = selected.includes(parent.id)
    if (kids.length === 0) return parentIn ? 'checked' : 'unchecked'
    const allKidsIn = kids.every(k => selected.includes(k.id))
    const anyKidIn  = kids.some(k => selected.includes(k.id))
    if (parentIn && allKidsIn) return 'checked'
    if (parentIn || anyKidIn) return 'indeterminate'
    return 'unchecked'
  }

  function toggleParent(parent: Category) {
    const kids  = kidsOf(parent.id)
    const state = parentState(parent)
    if (state === 'checked') {
      const remove = new Set([parent.id, ...kids.map(k => k.id)])
      onChange(selected.filter(id => !remove.has(id)))
    } else {
      const toAdd = [parent.id, ...kids.map(k => k.id)].filter(id => !selected.includes(id))
      onChange([...selected, ...toAdd])
    }
  }

  function toggleChild(childId: string) {
    onChange(
      selected.includes(childId)
        ? selected.filter(id => id !== childId)
        : [...selected, childId]
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <label style={labelStyle}>
          Allowed Item Categories
          {selected.length > 0 && (
            <span style={{ marginLeft: 6, background: '#2563eb', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>
              {selected.length}
            </span>
          )}
        </label>
        {!allSelected && categories.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(allIds)}
            disabled={disabled}
            style={{ fontSize: 10, color: '#2563eb', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 0, fontWeight: 600, opacity: disabled ? 0.5 : 1 }}
          >
            Select All
          </button>
        )}
      </div>

      <div style={{ border: '1px solid #e4e4e7', background: '#fafafa', maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
        {categories.length === 0 ? (
          <div style={{ padding: '12px', fontSize: 12, color: '#a1a1aa' }}>No categories available</div>
        ) : parents.map(parent => {
          const kids   = kidsOf(parent.id)
          const state  = parentState(parent)
          const isOpen = openGroups.has(parent.id)

          return (
            <div key={parent.id}>
              <div
                style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', background: '#f4f4f5' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f4f4f5')}
              >
                <button
                  type="button"
                  onClick={() => toggleOpen(parent.id)}
                  style={{
                    background: 'none', border: 'none', padding: '0 4px 0 0',
                    cursor: kids.length > 0 ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', color: '#71717a', flexShrink: 0,
                    opacity: kids.length === 0 ? 0 : 1,
                    pointerEvents: kids.length === 0 ? 'none' : 'auto',
                  }}
                >
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <ParentCheckbox
                  state={state}
                  onChange={() => !disabled && toggleParent(parent)}
                  disabled={disabled}
                />
                <span
                  style={{ fontSize: 12, fontWeight: 600, color: '#09090b', marginLeft: 8, cursor: disabled ? 'default' : 'pointer', userSelect: 'none' }}
                  onClick={() => !disabled && toggleParent(parent)}
                >
                  {parent.name}
                </span>
              </div>

              {isOpen && kids.map(child => (
                <label
                  key={child.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 36px', cursor: disabled ? 'default' : 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f4f4f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(child.id)}
                    onChange={() => toggleChild(child.id)}
                    disabled={disabled}
                    style={{ cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: '#52525b' }}>{child.name}</span>
                </label>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
