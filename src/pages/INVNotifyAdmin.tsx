import { useState } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { BrandFull } from './INVDetailPanel'

interface Props {
  brand: BrandFull
  onClose: () => void
}

export function INVNotifyAdmin({ brand, onClose }: Props) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [objective, setObjective] = useState('')
  const [justification, setJustification] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ objective?: string; justification?: string }>({})

  function validate() {
    const e: typeof errors = {}
    if (!objective.trim()) e.objective = 'Required.'
    if (!justification.trim()) e.justification = 'Required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)

    const { error } = await supabase.from('admin_notifications').insert({
      requested_by: user!.id,
      action_type: 'delete_brand',
      target_id: brand.id,
      target_name: `${brand.brand_code} — ${brand.brand_name}`,
      objective: objective.trim(),
      justification: justification.trim(),
    })

    setSubmitting(false)

    if (error) {
      addToast('Failed to send notification. Please try again.', 'error')
      return
    }

    addToast('Notification sent to admin.', 'success')
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', border: '1px solid #e4e4e7' }}>

        {/* Header */}
        <div style={{ background: '#09090b', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lock size={15} color="#fff" />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Access Restricted — Admin Required
          </span>
        </div>

        <div style={{ padding: 24 }}>

          {/* Warning */}
          <div style={{ background: '#fef9c3', border: '1px solid #fde68a', padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#78350f', margin: 0, lineHeight: 1.55 }}>
              You don't have permission to permanently delete brands.
              Only <strong>admins</strong> can perform this action. Fill in the fields below
              to notify an admin and request deletion.
            </p>
          </div>

          {/* Brand card */}
          <div style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', padding: '8px 12px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
              Brand to be deleted
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{brand.brand_name}</div>
            <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: '#71717a', marginTop: 2, letterSpacing: '0.05em' }}>
              {brand.brand_code}
            </div>
          </div>

          {/* Action Objective */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
              Action Objective *
            </label>
            <input
              type="text"
              value={objective}
              onChange={e => { setObjective(e.target.value); setErrors(v => ({ ...v, objective: undefined })) }}
              placeholder="e.g. Remove discontinued brand from inventory"
              disabled={submitting}
              style={{
                width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                border: `1px solid ${errors.objective ? '#dc2626' : '#e4e4e7'}`,
                background: '#fafafa', fontSize: 13, outline: 'none',
                opacity: submitting ? 0.6 : 1,
              }}
            />
            {errors.objective && (
              <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.objective}</p>
            )}
          </div>

          {/* Justification */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
              Justification *
            </label>
            <textarea
              value={justification}
              onChange={e => { setJustification(e.target.value); setErrors(v => ({ ...v, justification: undefined })) }}
              placeholder="Explain why this brand should be permanently deleted..."
              rows={4}
              disabled={submitting}
              style={{
                width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                border: `1px solid ${errors.justification ? '#dc2626' : '#e4e4e7'}`,
                background: '#fafafa', fontSize: 13, outline: 'none',
                resize: 'none', fontFamily: 'inherit',
                opacity: submitting ? 0.6 : 1,
              }}
            />
            {errors.justification && (
              <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.justification}</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: submitting ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, opacity: submitting ? 0.5 : 1 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '8px 20px', background: '#09090b', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1, minWidth: 140 }}
            >
              {submitting ? 'Sending...' : 'Notify Admin'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
