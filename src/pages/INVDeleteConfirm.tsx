import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { BrandFull } from './INVDetailPanel'

interface Props {
  brand: BrandFull
  onClose: () => void
  onDeleted: () => void
}

export function INVDeleteConfirm({ brand, onClose, onDeleted }: Props) {
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'confirm' | 'verifying' | 'deleting'>('confirm')

  async function handleDelete() {
    console.debug('[INVDeleteConfirm] profile role received:', profile?.role)
    if (profile?.role?.toLowerCase() !== 'admin') {
      setError('You do not have admin privileges to perform this action.')
      return
    }
    if (!password.trim()) { setError('Password is required to authorize this action.'); return }
    setStep('verifying')
    setError('')

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user!.email!,
      password,
    })

    if (authErr) {
      setStep('confirm')
      setError('Incorrect password. Deletion not authorized.')
      return
    }

    setStep('deleting')
    const { error: delErr } = await supabase.from('brands').delete().eq('id', brand.id)

    if (delErr) {
      setStep('confirm')
      addToast(`Delete failed: ${delErr.message}`, 'error')
      return
    }

    addToast(`"${brand.brand_name}" permanently deleted.`, 'info')
    onDeleted()
  }

  const busy = step !== 'confirm'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', border: '2px solid #dc2626' }}>

        {/* Critical header */}
        <div style={{ background: '#dc2626', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#fff" />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Critical Action — Admin Only
          </span>
        </div>

        <div style={{ padding: 24 }}>
          {/* Warning text */}
          <p style={{ fontSize: 13, color: '#3f3f46', marginBottom: 16, lineHeight: 1.6 }}>
            You are about to <strong style={{ color: '#dc2626' }}>permanently delete</strong> this brand.
            All associated data will be lost. <strong>This action cannot be undone.</strong>
          </p>

          {/* Brand card */}
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Brand to be permanently deleted
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b' }}>{brand.brand_name}</div>
            <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: '#71717a', marginTop: 2, letterSpacing: '0.05em' }}>
              {brand.brand_code}
            </div>
          </div>

          {/* Password field */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Confirm your admin password *
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && !busy && handleDelete()}
              placeholder="Enter your password to confirm"
              autoFocus
              disabled={busy}
              style={{
                width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                border: `1px solid ${error ? '#dc2626' : '#e4e4e7'}`,
                background: '#fafafa', fontSize: 13, outline: 'none',
                opacity: busy ? 0.6 : 1,
              }}
            />
            {error && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={12} /> {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={busy}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: busy ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, opacity: busy ? 0.5 : 1 }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={busy}
              style={{ padding: '8px 20px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, minWidth: 160 }}
            >
              {step === 'verifying' ? 'Verifying password...' : step === 'deleting' ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
