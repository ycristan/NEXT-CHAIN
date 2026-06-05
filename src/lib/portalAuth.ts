// src/lib/portalAuth.ts
import { supabase } from './supabase'

const INTERNAL_DOMAIN = 'nextchain.internal'

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface AuthResult {
  error: string | null
}

// ─── Funções puras ────────────────────────────────────────────────────────────

/** Converte username em email interno do Supabase Auth (invisível ao usuário). */
export function buildInternalEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_DOMAIN}`
}

/**
 * Valida o PIN do usuário.
 * Regras: 6-8 caracteres, apenas letras e números (sem espaços ou símbolos).
 */
export function validatePin(pin: string): ValidationResult {
  if (!pin) return { valid: false, error: 'PIN é obrigatório' }
  if (!/^[a-zA-Z0-9]+$/.test(pin)) {
    return { valid: false, error: 'PIN deve conter apenas letras e números (sem espaços ou símbolos)' }
  }
  if (pin.length < 6) return { valid: false, error: 'PIN deve ter no mínimo 6 caracteres' }
  if (pin.length > 8) return { valid: false, error: 'PIN deve ter no máximo 8 caracteres' }
  return { valid: true }
}

/**
 * Valida o username do usuário.
 * Regras: 3-20 caracteres, apenas letras, números e underscore. Sem @ ou espaços.
 */
export function validateUsername(username: string): ValidationResult {
  if (!username || username.trim() === '') {
    return { valid: false, error: 'Username é obrigatório' }
  }
  if (username.length < 3) {
    return { valid: false, error: 'Username deve ter no mínimo 3 caracteres' }
  }
  if (username.length > 20) {
    return { valid: false, error: 'Username deve ter no máximo 20 caracteres' }
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username deve conter apenas letras, números e underscore (_)' }
  }
  return { valid: true }
}

// ─── Funções de autenticação ──────────────────────────────────────────────────

/**
 * Login unificado para todos os usuários (staff + clientes).
 * Valida username e PIN antes de chamar o Supabase.
 * O roteamento pós-login (WMS vs Portal) é feito pelo App.tsx com base em profile.role.
 */
export async function signIn(username: string, pin: string): Promise<AuthResult> {
  const usernameValidation = validateUsername(username)
  if (!usernameValidation.valid) return { error: usernameValidation.error! }

  const pinValidation = validatePin(pin)
  if (!pinValidation.valid) return { error: pinValidation.error! }

  const { error } = await supabase.auth.signInWithPassword({
    email: buildInternalEmail(username),
    password: pin,
  })

  return { error: error?.message ?? null }
}

/** Encerra a sessão do usuário atual. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Envia email de recuperação de acesso para o email real cadastrado.
 * O link redireciona para /setup-pin onde o usuário redefine seu PIN.
 */
export async function requestPinReset(realEmail: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(realEmail, {
    redirectTo: `${window.location.origin}/setup-pin`,
  })
  return { error: error?.message ?? null }
}
