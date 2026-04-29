# Security & Quality Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todas as vulnerabilidades de segurança, race conditions e problemas de qualidade identificados no audit de 2026-04-29, sem alterar comportamento visível ao usuário.

**Architecture:** Fixes SQL executados via Supabase SQL Editor (não têm testes automatizados — verificação é manual). Fixes TypeScript aplicados na codebase com testes Vitest onde aplicável, commit por tarefa.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgreSQL + RLS) + Vitest

---

## Arquivos afetados

| Arquivo | Ação | Issue |
|---|---|---|
| `sql/fix_is_admin_canonical.sql` | Criar | CRIT-1 |
| `sql/fix_admin_notifications_rls.sql` | Criar | CRIT-2 |
| `sql/fix_storage_policies.sql` | Criar | CRIT-3 |
| `sql/fix_slots_racks_update_rls.sql` | Criar | CRIT-4 |
| `src/pages/PLReplanningView.tsx` | Modificar | CRIT-5, IMP-6 |
| `src/contexts/AuthContext.tsx` | Modificar | IMP-1 |
| `src/pages/Inventory.tsx` | Modificar | IMP-3, IMP-8, IMP-9 |
| `src/pages/PickingLine.tsx` | Modificar | IMP-8 |
| `src/pages/Fridge.tsx` | Modificar | IMP-8, IMP-11 |
| `src/pages/INVDeleteConfirm.tsx` | Modificar | IMP-8 |
| `src/pages/PLSlotContextMenu.tsx` | Modificar | IMP-8 |
| `src/lib/pickingLineService.ts` | Modificar | MIN-4 |

---

> ⚠️ **NOTA GLOBAL PARA TASKS SQL (1–4):** Cada task SQL cria um arquivo em `sql/`. Após commitar o arquivo, o conteúdo DEVE ser executado manualmente no **Supabase SQL Editor** (supabase.com → seu projeto → SQL Editor) antes de prosseguir para a próxima task. Os scripts são idempotentes (usam `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).

---

## Task 1 — CRIT-1: Consolidar `is_admin()` com `lower()` canônico

**Problema:** `is_admin()` está definida em dois scripts com comportamentos diferentes. `fix_profiles_rls_recursion.sql` usa `role = 'admin'` (case-sensitive). `picking_line_racks_slots.sql` usa `lower(role) = 'admin'` (correto). O cliente usa `role?.toLowerCase()`, então a versão sem `lower()` pode negar acesso a admins com role `'Admin'`.

**Files:**
- Criar: `sql/fix_is_admin_canonical.sql`

- [ ] **Step 1: Criar o script SQL**

Criar o arquivo `sql/fix_is_admin_canonical.sql` com o conteúdo:

```sql
-- ============================================================
-- FIX CRIT-1: Consolidate is_admin() to always use lower()
--
-- Replaces both definitions with a single canonical version.
-- The previous version in fix_profiles_rls_recursion.sql used
-- role = 'admin' (case-sensitive), which silently denied access
-- to admins with role stored as 'Admin' or 'ADMIN'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) = 'admin'
  );
$$;
```

- [ ] **Step 2: Commit**

```bash
git add sql/fix_is_admin_canonical.sql
git commit -m "fix(sql): consolidate is_admin() to use lower(role) — CRIT-1"
git push origin feat/security-quality-audit
```

- [ ] **Step 3: Executar no Supabase SQL Editor**

Copiar o conteúdo de `sql/fix_is_admin_canonical.sql` e executar no Supabase SQL Editor.

Resultado esperado: `Success. No rows returned.`

- [ ] **Step 4: Verificar**

No Supabase SQL Editor, executar:
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace;
```
Confirmar que a definição contém `lower(role) = 'admin'`.

---

## Task 2 — CRIT-2: Corrigir RLS de `admin_notifications` — remover recursão

**Problema:** As policies SELECT e UPDATE de `admin_notifications` fazem subquery direta em `profiles` com RLS ativo, recriando a recursão infinita que `fix_profiles_rls_recursion.sql` corrigiu. Devem usar `public.is_admin()`.

**Files:**
- Criar: `sql/fix_admin_notifications_rls.sql`

- [ ] **Step 1: Criar o script SQL**

Criar o arquivo `sql/fix_admin_notifications_rls.sql`:

```sql
-- ============================================================
-- FIX CRIT-2: Replace direct profiles subquery in
-- admin_notifications RLS with is_admin() SECURITY DEFINER.
--
-- The original SELECT and UPDATE policies query public.profiles
-- directly inside a policy on admin_notifications. Since both
-- tables have RLS enabled, this can trigger infinite recursion
-- (same pattern fixed by fix_profiles_rls_recursion.sql).
-- ============================================================

-- Drop the broken policies
DROP POLICY IF EXISTS "Users see own; admins see all" ON public.admin_notifications;
DROP POLICY IF EXISTS "Admins can update notifications"  ON public.admin_notifications;

-- Re-create SELECT: own rows OR admin
CREATE POLICY "Users see own; admins see all"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_admin()
  );

-- Re-create UPDATE: admin only
CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());
```

- [ ] **Step 2: Commit**

```bash
git add sql/fix_admin_notifications_rls.sql
git commit -m "fix(sql): replace profiles subquery in admin_notifications RLS — CRIT-2"
git push origin feat/security-quality-audit
```

- [ ] **Step 3: Executar no Supabase SQL Editor**

Copiar e executar no SQL Editor. Resultado esperado: `Success. No rows returned.`

- [ ] **Step 4: Verificar**

```sql
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'admin_notifications';
```
Confirmar que nenhuma policy contém `FROM public.profiles` — todas devem usar `is_admin()`.

---

## Task 3 — CRIT-3: Restringir policies de Storage — imagens

**Problema:** As policies do bucket `brands` (Storage) permitem que qualquer usuário autenticado — inclusive viewer — delete ou sobrescreva imagens de qualquer marca. Apenas admins devem poder escrever/deletar.

**Files:**
- Criar: `sql/fix_storage_policies.sql`

- [ ] **Step 1: Criar o script SQL**

Criar o arquivo `sql/fix_storage_policies.sql`:

```sql
-- ============================================================
-- FIX CRIT-3: Restrict Storage bucket 'brands' write/delete
-- to admin users only.
--
-- Previous policies allowed any authenticated user to INSERT,
-- UPDATE, or DELETE objects in the 'brands' bucket, enabling
-- any viewer/operator to overwrite or delete brand images.
-- ============================================================

-- ── Drop existing permissive write/delete policies ─────────
-- (Names may vary depending on how they were created via Dashboard.
--  The DROP IF EXISTS is safe to run even if names differ.)

DROP POLICY IF EXISTS "Allow authenticated uploads"         ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes"         ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates"         ON storage.objects;
DROP POLICY IF EXISTS "items_images_storage_insert"         ON storage.objects;
DROP POLICY IF EXISTS "items_images_storage_delete"         ON storage.objects;
DROP POLICY IF EXISTS "items_images_storage_update"         ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_insert"               ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_delete"               ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_update"               ON storage.objects;

-- ── SELECT: any authenticated user can read images ─────────
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_select"     ON storage.objects;

CREATE POLICY "brands_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'brands');

-- ── INSERT: admin only ──────────────────────────────────────
CREATE POLICY "brands_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brands' AND public.is_admin());

-- ── UPDATE: admin only ──────────────────────────────────────
CREATE POLICY "brands_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brands' AND public.is_admin());

-- ── DELETE: admin only ──────────────────────────────────────
CREATE POLICY "brands_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brands' AND public.is_admin());
```

- [ ] **Step 2: Commit**

```bash
git add sql/fix_storage_policies.sql
git commit -m "fix(sql): restrict storage bucket 'brands' write/delete to admin — CRIT-3"
git push origin feat/security-quality-audit
```

- [ ] **Step 3: Executar no Supabase SQL Editor**

Executar no SQL Editor. Se algum `DROP POLICY IF EXISTS` der erro de permissão em `storage.objects`, executar via **Supabase Dashboard → Storage → Policies** e remover as policies permissivas manualmente, depois criar as novas.

- [ ] **Step 4: Verificar**

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';
```
Confirmar que INSERT, UPDATE, DELETE contêm `is_admin()`.

---

## Task 4 — CRIT-4: Restringir `slots_update` e `racks_update`

**Problema:** `USING (true)` nas policies UPDATE de `slots` e `racks` permite que qualquer usuário autenticado modifique slots e racks diretamente via Supabase client. Operadores precisam alocar slots, mas viewers não devem ter acesso a UPDATE.

**Decisão de design:** `slots` UPDATE → roles `manager` e `admin` (operadores fazem alocação, managers e acima aprovam mudanças estruturais). `racks` UPDATE → somente `admin` (mudanças em racks são estruturais).

**Files:**
- Criar: `sql/fix_slots_racks_update_rls.sql`

- [ ] **Step 1: Criar o script SQL**

Criar o arquivo `sql/fix_slots_racks_update_rls.sql`:

```sql
-- ============================================================
-- FIX CRIT-4: Restrict UPDATE policies on slots and racks.
--
-- Previous policies used USING (true), allowing any
-- authenticated user (including viewers) to UPDATE any slot
-- or rack directly via the Supabase client.
--
-- New rules:
--   slots UPDATE  → operator, manager, or admin
--   racks UPDATE  → manager or admin only
-- ============================================================

-- ── slots ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "slots_update" ON public.slots;

CREATE POLICY "slots_update"
  ON public.slots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND lower(role) IN ('operator', 'manager', 'admin')
    )
  );

-- ── racks ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "racks_update" ON public.racks;

CREATE POLICY "racks_update"
  ON public.racks FOR UPDATE
  TO authenticated
  USING (public.is_admin());
```

> **Nota:** `slots_update` não usa `is_admin()` porque precisa de três roles. A subquery em `profiles` aqui é segura — `profiles` tem RLS mas esta query não é recursiva (está numa policy de `slots`, não de `profiles`).

- [ ] **Step 2: Commit**

```bash
git add sql/fix_slots_racks_update_rls.sql
git commit -m "fix(sql): restrict slots/racks UPDATE to appropriate roles — CRIT-4"
git push origin feat/security-quality-audit
```

- [ ] **Step 3: Executar no Supabase SQL Editor**

Executar no SQL Editor. Resultado esperado: `Success. No rows returned.`

- [ ] **Step 4: Verificar**

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('slots', 'racks')
  AND cmd = 'UPDATE';
```
Confirmar que nenhuma policy retorna `USING (true)`.

---

## Task 5 — CRIT-5: Limpar `publishPwd` no unmount de `PLReplanningView`

**Problema:** A senha do admin fica em estado React durante toda a vida do modal de publicação. Se o componente desmontar sem o usuário clicar Cancel (ex: fechando a aba, erro no pai), a senha persiste em memória. Também não é limpa após tentativa bem-sucedida ou mal-sucedida de autenticação.

**Files:**
- Modificar: `src/pages/PLReplanningView.tsx`

- [ ] **Step 1: Adicionar cleanup no unmount**

Em `PLReplanningView.tsx`, localizar o bloco de `useState` de publish (em torno da linha 76) e adicionar um `useEffect` de cleanup logo após os `useState` relacionados ao publish:

```tsx
// Após os useState de publishModal, publishPwd, showPwd, publishing, publishError:
useEffect(() => {
  return () => { setPublishPwd('') }
}, [])
```

- [ ] **Step 2: Limpar senha imediatamente após signInWithPassword**

Localizar `handlePublish` (em torno da linha 128). Após o bloco `if (authErr)` (linha 140-144) e após a chamada `supabase.rpc('publish_replanning', ...)` (linha 146), adicionar limpeza imediata:

```tsx
async function handlePublish() {
  if (!publishPwd.trim()) { setPublishError('Enter your password.'); return }
  setPublishing(true)
  setPublishError(null)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) { setPublishError('Could not retrieve current user.'); setPublishing(false); return }

  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: publishPwd,
  })
  setPublishPwd('')  // ← limpar imediatamente após a tentativa, sucesso ou falha
  if (authErr) {
    setPublishError('Incorrect password. Authorization denied.')
    setPublishing(false)
    return
  }

  const { error: rpcErr } = await supabase.rpc('publish_replanning', { p_rack_id: rack.id })
  if (rpcErr) {
    setPublishError(`Publish failed: ${rpcErr.message}`)
    setPublishing(false)
    return
  }

  addToast(`Rack ${rack.name} replanning published successfully.`, 'success')
  onPublished()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/PLReplanningView.tsx
git commit -m "fix: clear publishPwd on unmount and after auth attempt — CRIT-5"
git push origin feat/security-quality-audit
```

---

## Task 6 — IMP-1: Tratar erro de fetch de profile em `AuthContext`

**Problema:** Se `fetchProfile` falha (network, RLS), `data` é `null`, `setProfile(null)` é chamado, `setLoading(false)` é chamado, e o app renderiza silenciosamente com `profile === null` — todo admin check vira `false`, degradando o usuário a viewer sem nenhum aviso.

**Files:**
- Modificar: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Adicionar `profileError` ao contexto**

Substituir o arquivo `src/contexts/AuthContext.tsx` inteiro:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null)
  const [session, setSession]         = useState<Session | null>(null)
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [loading, setLoading]         = useState(true)
  const [profileError, setProfileError] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) void fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) void fetchProfile(session.user.id)
      else {
        setProfile(null)
        setProfileError(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    setProfileError(false)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !data) {
      setProfileError(true)
      setLoading(false)
      return
    }

    setProfile(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, profileError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

- [ ] **Step 2: Exibir erro em `ProtectedRoute`**

Localizar `src/components/ProtectedRoute.tsx` e adicionar tratamento de `profileError`:

```tsx
// Adicionar ao destructuring de useAuth():
const { user, profile, loading, profileError, ... } = useAuth()

// Adicionar após o guard de loading:
if (profileError) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: '#ef4444', fontWeight: 600 }}>Could not load user profile.</p>
      <p style={{ color: '#71717a', fontSize: 13 }}>Please refresh the page. If the problem persists, contact your administrator.</p>
      <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '6px 16px', background: '#18181b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        Refresh
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.tsx src/components/ProtectedRoute.tsx
git commit -m "fix: surface profile fetch error in AuthContext — IMP-1"
git push origin feat/security-quality-audit
```

---

## Task 7 — IMP-3: Debounce `loadAllocMap` no realtime do Inventory

**Problema:** Dois eventos realtime simultâneos (slot + fridge_item) disparam dois `loadAllocMap()` em paralelo. O que resolver por último sobrescreve o anterior com dados potencialmente desatualizados.

**Files:**
- Modificar: `src/pages/Inventory.tsx`

- [ ] **Step 1: Adicionar ref de debounce e função `scheduleAllocMapRefresh`**

Em `Inventory.tsx`, dentro do componente (antes do `useEffect`), adicionar o ref:

```tsx
const allocDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function scheduleAllocMapRefresh() {
  if (allocDebounceRef.current) clearTimeout(allocDebounceRef.current)
  allocDebounceRef.current = setTimeout(() => { void loadAllocMap() }, 50)
}
```

- [ ] **Step 2: Substituir chamadas diretas no `useEffect` do realtime**

Localizar o `useEffect` que cria o canal `inv-alloc-realtime` (linhas 185-201) e substituir as duas chamadas `void loadAllocMap()` por `scheduleAllocMapRefresh()`:

```tsx
useEffect(() => {
  void loadAll()
  void loadAllocMap()
  void loadBarcodesMap()

  const channel = supabase.channel('inv-alloc-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
      scheduleAllocMapRefresh()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fridge_items' }, () => {
      scheduleAllocMapRefresh()
    })
    .subscribe()

  return () => {
    if (allocDebounceRef.current) clearTimeout(allocDebounceRef.current)
    void supabase.removeChannel(channel)
  }
}, [])
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Inventory.tsx
git commit -m "fix: debounce loadAllocMap realtime calls to prevent race condition — IMP-3"
git push origin feat/security-quality-audit
```

---

## Task 8 — IMP-6: Remover chamada duplicada de `getAllDraftBrandIdsForRackType` em `PLReplanningView`

**Problema:** No mount, `loadDraft` chama `getAllDraftBrandIdsForRackType` (linha 113) e `loadChecklist` também chama a mesma função (linha 121). Ambas correm em paralelo, podendo sobrescrever `allDraftBrandIds` com dados desatualizados.

**Files:**
- Modificar: `src/pages/PLReplanningView.tsx`

- [ ] **Step 1: Remover a chamada de `getAllDraftBrandIdsForRackType` de `loadDraft`**

Localizar a função `loadDraft` (em torno da linha 102) e remover o bloco que chama `getAllDraftBrandIdsForRackType`:

```tsx
async function loadDraft() {
  setLoading(true)
  const { data, error } = await getReplanningSlots(rack.id)
  if (error) {
    addToast(`Error loading draft: ${error}`, 'error')
  } else {
    setDraftSlots((data ?? []) as ReplanningSlot[])
  }
  setLoading(false)
  // REMOVIDO: void getAllDraftBrandIdsForRackType(rack.rack_type_id).then(setAllDraftBrandIds)
  // allDraftBrandIds é gerenciado exclusivamente por loadChecklist()
}
```

`loadChecklist` já busca `allDraftBrandIds` e é chamada no mesmo `useEffect`, então o estado será atualizado corretamente.

- [ ] **Step 2: Commit**

```bash
git add src/pages/PLReplanningView.tsx
git commit -m "fix: remove duplicate getAllDraftBrandIdsForRackType call in loadDraft — IMP-6"
git push origin feat/security-quality-audit
```

---

## Task 9 — IMP-8: Remover `console.log`/`console.debug` de produção

**Problema:** Logs em produção expõem IDs, roles, e payloads internos no DevTools de qualquer usuário. 8 ocorrências em 5 arquivos.

**Files:**
- Modificar: `src/contexts/AuthContext.tsx`, `src/pages/Fridge.tsx`, `src/pages/Inventory.tsx`, `src/pages/PickingLine.tsx`, `src/pages/PLSlotContextMenu.tsx`, `src/pages/INVDeleteConfirm.tsx`

- [ ] **Step 1: Remover log de `AuthContext.tsx`**

Localizar linha 51 e remover:
```tsx
// REMOVER esta linha:
console.debug('[AuthContext] profile loaded from DB:', { id: data?.id, role: data?.role })
```

- [ ] **Step 2: Remover logs de `Fridge.tsx`**

Localizar e remover:
```tsx
// Linha 114 — REMOVER:
console.log('[Realtime] MUDANÇA DETECTADA (fridge_items):', payload)

// Linha 150 — REMOVER (dentro do .subscribe callback):
console.log('[Realtime] fridge-realtime status:', status, err ?? '')
```

O callback `.subscribe()` fica apenas como `() => {}` ou pode ser removido completamente se não houver outro conteúdo:
```tsx
.subscribe()
```

- [ ] **Step 3: Remover log de `Inventory.tsx`**

Localizar linha 228 e remover:
```tsx
// REMOVER esta linha:
console.debug(`[Inventory] Total brands loaded from DB: ${allBrands.length}`)
```

- [ ] **Step 4: Remover logs de `PickingLine.tsx`**

Localizar e remover as três ocorrências:
```tsx
// REMOVER (linha ~564):
console.log('[Realtime] MUDANÇA DETECTADA (slots):', payload)

// REMOVER (linha ~637):
console.log('[Realtime] MUDANÇA DETECTADA (racks):', payload)

// REMOVER (linha ~645):
console.log('[Realtime] MUDANÇA DETECTADA (replanning_slots):', payload)

// REMOVER (dentro do .subscribe callback, linha ~650):
console.log('[Realtime] pl-realtime status:', status, err ?? '')
```

- [ ] **Step 5: Remover log de `PLSlotContextMenu.tsx`**

Localizar linha ~161 e remover:
```tsx
// REMOVER:
console.log('[ContextMenu] Saving slot', target.slotId, target.binAddress, payload)
```

- [ ] **Step 6: Remover log de `INVDeleteConfirm.tsx`**

Localizar e remover:
```tsx
// REMOVER:
console.debug('[INVDeleteConfirm] profile role received:', profile?.role)
```

- [ ] **Step 7: Commit**

```bash
git add src/contexts/AuthContext.tsx src/pages/Fridge.tsx src/pages/Inventory.tsx src/pages/PickingLine.tsx src/pages/PLSlotContextMenu.tsx src/pages/INVDeleteConfirm.tsx
git commit -m "fix: remove console.log/debug from production code — IMP-8"
git push origin feat/security-quality-audit
```

---

## Task 10 — IMP-9: Tratar erro silencioso em `loadBarcodesMap`

**Problema:** Erro em `loadBarcodesMap` faz o loop parar silenciosamente, deixando `barcodesMap` vazio. O usuário vê `'—'` em todas as colunas de barcode sem nenhum aviso. Se a tabela `brand_barcodes` não existir, falha em todo carregamento.

**Files:**
- Modificar: `src/pages/Inventory.tsx`

- [ ] **Step 1: Adicionar toast de erro em `loadBarcodesMap`**

Localizar a função `loadBarcodesMap` e adicionar tratamento de erro visível. Localizar o bloco de erro dentro do loop while e substituir:

```tsx
async function loadBarcodesMap() {
  let page = 0
  const map = new Map<string, string[]>()
  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('brand_barcodes')
      .select('brand_id, barcode')
      .range(from, to)

    if (error) {
      if (import.meta.env.DEV) console.error('[Inventory] loadBarcodesMap error:', error.message)
      addToast('Could not load barcodes. Barcode columns will be empty.', 'error')
      break
    }

    if (!data || data.length === 0) break
    for (const row of data as { brand_id: string; barcode: string }[]) {
      const existing = map.get(row.brand_id) ?? []
      existing.push(row.barcode)
      map.set(row.brand_id, existing)
    }
    if (data.length < PAGE_SIZE) break
    page++
  }
  setBarcodesMap(map)
}
```

> **Nota:** Se `brand_barcodes` ainda não existe no Supabase, o toast informará o usuário. A feature de barcodes no column picker depende desta tabela existir.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Inventory.tsx
git commit -m "fix: surface loadBarcodesMap error via toast instead of silent failure — IMP-9"
git push origin feat/security-quality-audit
```

---

## Task 11 — IMP-11: Corrigir double-call de `handleMouseLeave` em `Fridge.tsx`

**Problema:** O card tem `onMouseLeave` E `onMouseOut`. O `onMouseOut` chama `handleMouseLeave()` uma segunda vez e dispara ao sair de elementos filhos (bubbling), causando flicker no hover preview e double-hide.

**Files:**
- Modificar: `src/pages/Fridge.tsx`

- [ ] **Step 1: Consolidar hover handlers**

Localizar o `<div>` do card (linha ~332) e remover `onMouseOver`/`onMouseOut`, movendo o box-shadow para `onMouseEnter`/`onMouseLeave`:

```tsx
<div
  key={item.id}
  onMouseEnter={e => {
    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
    handleMouseEnter(item)
  }}
  onMouseLeave={e => {
    (e.currentTarget as HTMLElement).style.boxShadow = 'none'
    handleMouseLeave()
  }}
  style={{
    position: 'relative',
    background: '#fff',
    border: '1px solid #e4e4e7',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    cursor: 'default',
    transition: 'box-shadow 0.15s',
  }}
>
```

Remover completamente as propriedades `onMouseOver` e `onMouseOut` do elemento.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Fridge.tsx
git commit -m "fix: consolidate Fridge card hover handlers — remove double handleMouseLeave — IMP-11"
git push origin feat/security-quality-audit
```

---

## Task 12 — MIN-4: Adicionar `light_status` em `updateSlotLightAddress`

**Problema:** `updateSlotLightAddress` em `pickingLineService.ts` não atualiza `light_status` junto com `light_address`, violando a diretriz do CLAUDE.md: "ao salvar qualquer update com `light_address`, sempre incluir `light_status: addr ? 'on' : 'off'`".

**Files:**
- Modificar: `src/lib/pickingLineService.ts`

- [ ] **Step 1: Adicionar `light_status` ao update**

Localizar `updateSlotLightAddress` (linha ~233) e atualizar o payload:

```tsx
export async function updateSlotLightAddress(
  slotId: string,
  lightAddress: string | null,
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('slots')
    .update({
      light_address: lightAddress,
      light_status: lightAddress ? 'on' : 'off',
    })
    .eq('id', slotId)

  return { error: error?.message ?? null }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pickingLineService.ts
git commit -m "fix: add light_status to updateSlotLightAddress per CLAUDE.md guideline — MIN-4"
git push origin feat/security-quality-audit
```

---

## Task 13 — IMP-2: `loadAll({ silent })` no Inventory (dívida técnica conhecida)

**Problema:** `loadAll` no `Inventory.tsx` sempre chama `setLoading(true)`, causando flash de spinner após cada save. Já foi preparado em sessão anterior.

**Files:**
- Modificar: `src/pages/Inventory.tsx`

- [ ] **Step 1: Adicionar parâmetro `silent` à assinatura de `loadAll`**

```tsx
async function loadAll({ silent = false }: { silent?: boolean } = {}) {
  if (!silent) setLoading(true)
  // ... resto do loop inalterado ...
  setBrands(allBrands)
  if (!silent) setLoading(false)
}
```

- [ ] **Step 2: Atualizar callers pós-save**

```tsx
// handleSaved (linha ~451):
function handleSaved() { setShowForm(false); void loadAll({ silent: true }) }

// onRefresh no INVDetailPanel (linha ~886):
onRefresh={() => void loadAll({ silent: true })}

// onDone no INVImport (linha ~920):
onDone={() => { setShowImport(false); void loadAll({ silent: true }) }}

// onDone no INVFixSubcategories (linha ~927):
onDone={() => { void loadAll({ silent: true }) }}

// onDeleted — MANTER sem silent (deleção destrutiva, reset intencional):
onDeleted={() => { setShowDelete(false); setSelectedId(null); void loadAll() }}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Inventory.tsx
git commit -m "fix: add silent option to loadAll — no spinner flash after saves — IMP-2"
git push origin feat/security-quality-audit
```

---

## Task 14 — Final: PR e merge

- [ ] **Step 1: Verificar que não há arquivos locais pendentes**

```bash
git status
```
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Abrir o Pull Request no GitHub**

Acessar `https://github.com/ycristan/NEXT-CHAIN/compare/feat/security-quality-audit` e criar PR com:
- **Title:** `fix: security & quality audit — CRIT-1 through MIN-4`
- **Body:** Referenciar o audit report em `docs/superpowers/specs/` e listar os issues corrigidos.

- [ ] **Step 3: Revisão pelo Project Owner**

Revisar as mudanças no GitHub. Testar manualmente:
- Login como admin e como viewer — verificar que permissões continuam corretas
- Alocar um slot no Picking Line — verificar que light_status é atualizado
- Acessar Inventory — verificar ausência de spinner flash após save
- Verificar que console está limpo no DevTools em produção

- [ ] **Step 4: Merge na main**

Após aprovação, fazer merge via botão no GitHub PR.

---

## Ordem de execução recomendada

```
Task 1 (SQL) → executar Supabase → Task 2 (SQL) → executar Supabase →
Task 3 (SQL) → executar Supabase → Task 4 (SQL) → executar Supabase →
Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 12 → Task 13 →
Task 14 (PR + merge)
```

Tasks SQL devem ser executadas e verificadas no Supabase **antes** de avançar para as Tasks TypeScript.
