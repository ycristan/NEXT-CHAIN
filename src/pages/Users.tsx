import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { Profile, UserRole } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

const roleLabels: Record<UserRole, { label: string; color: string }> = {
  admin: { label: 'Administrator', color: 'bg-purple-100 text-purple-700' },
  manager: { label: 'Manager', color: 'bg-blue-100 text-blue-700' },
  operator: { label: 'Operator', color: 'bg-green-100 text-green-700' },
  viewer: { label: 'Viewer', color: 'bg-gray-100 text-gray-700' },
}

export function Users() {
  const { profile: currentProfile } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRole, setEditingRole] = useState<{ id: string; role: UserRole } | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setUsers((data ?? []) as Profile[])
    setLoading(false)
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setEditingRole(null)
    void load()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <p className="text-sm text-gray-500">{users.length} user(s) in the system</p>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-3 text-left">User</th>
              <th className="px-5 py-3 text-left">Role</th>
              <th className="px-5 py-3 text-left hidden sm:table-cell">Since</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </td></tr>
            ) : users.map(u => {
              const badge = roleLabels[u.role]
              const isMe = u.id === currentProfile?.id
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 flex-shrink-0">
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.full_name} {isMe && <span className="text-xs text-gray-400">(you)</span>}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {editingRole?.id === u.id ? (
                      <select
                        value={editingRole.role}
                        onChange={e => setEditingRole({ id: u.id, role: e.target.value as UserRole })}
                        onBlur={() => handleRoleChange(u.id, editingRole.role)}
                        autoFocus
                        className="rounded-lg border border-blue-500 px-2 py-1 text-xs outline-none"
                      >
                        {(Object.keys(roleLabels) as UserRole[]).map(r => (
                          <option key={r} value={r}>{roleLabels[r].label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}>{badge.label}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">{formatDate(u.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {!isMe && (
                      <button
                        onClick={() => setEditingRole({ id: u.id, role: u.role })}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Change role
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
        <p className="font-medium mb-2">Access levels:</p>
        <ul className="space-y-1 text-xs">
          <li><strong>Administrator</strong> — Full system access, including users and settings</li>
          <li><strong>Manager</strong> — Access to products, movements, suppliers, categories and reports</li>
          <li><strong>Operator</strong> — Can view products and register movements</li>
          <li><strong>Viewer</strong> — Read-only access to products and dashboard</li>
        </ul>
      </div>
    </div>
  )
}
