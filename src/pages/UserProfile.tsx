import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export function UserProfile() {
  const { profile } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    operator: 'Operator',
    viewer: 'Viewer',
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('profiles').update({ full_name: name }).eq('id', profile!.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: '1px solid #e4e4e7', background: '#fafafa',
    color: '#09090b', fontSize: 13, outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, fontWeight: 700,
    color: '#71717a', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 8,
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
          System
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#09090b', letterSpacing: '-0.5px' }}>
          User
        </h1>
      </div>

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, background: '#2563eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color: '#fff',
        }}>
          {profile?.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#09090b' }}>{profile?.full_name}</div>
          <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>
            {profile?.role ? roleLabels[profile.role] : ''}
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ background: '#fff', border: '1px solid #e4e4e7', padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Full Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = '#2563eb')}
            onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Email</label>
          <input value={profile?.email ?? ''} disabled style={{ ...inputStyle, background: '#f4f4f5', color: '#a1a1aa', cursor: 'not-allowed' }} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Access Level</label>
          <input value={profile?.role ? roleLabels[profile.role] : ''} disabled style={{ ...inputStyle, background: '#f4f4f5', color: '#a1a1aa', cursor: 'not-allowed' }} />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '9px 20px',
            background: saved ? '#059669' : '#09090b',
            border: 'none', color: '#fff',
            fontSize: 12, fontWeight: 700,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
