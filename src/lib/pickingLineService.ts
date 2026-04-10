/**
 * pickingLineService.ts
 *
 * Data-access helpers for Picking Line allocation.
 * All functions return typed results; callers handle errors.
 */

import { supabase } from './supabase'

// ── Types ──────────────────────────────────────────────────────

export interface AllocatableBrand {
  id: string
  brand_code: string
  brand_name: string
  bpu: number | null
  category_id: string | null
  category1_id: string | null
  /** true  → already in a slot of the SAME rack type (cannot allocate again) */
  isAllocatedInType: boolean
  /** bin address where it's currently allocated (same type), if any */
  allocatedAt: string | null
}

export interface AllocationResult {
  error: string | null
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Returns brands eligible for allocation into a given rack.
 *
 * Filtering rules:
 *   1. Brand must be active (is_active = true)
 *   2. Brand's category_id OR category1_id must be in the rack's allowed categories
 *      (if the rack has no allowed categories, ALL active brands are returned)
 *   3. Each brand is flagged with isAllocatedInType=true if it already occupies
 *      a slot in any rack sharing the same rack_type_id.
 */
export async function getBrandsForAllocation(
  rackId: string,
): Promise<{ data: AllocatableBrand[] | null; error: string | null }> {
  // ── 1. Fetch rack metadata ──────────────────────────────────
  const { data: rack, error: rackErr } = await supabase
    .from('racks')
    .select('id, rack_type_id, rack_allowed_categories(category_id)')
    .eq('id', rackId)
    .single()

  if (rackErr || !rack) return { data: null, error: rackErr?.message ?? 'Rack not found' }

  const allowedCatIds: string[] = (
    rack.rack_allowed_categories as { category_id: string }[]
  ).map(c => c.category_id)

  // ── 2. Query active brands, filtered by category ────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('brands')
    .select('id, brand_code, brand_name, bpu, category_id, category1_id')
    .eq('is_active', true)
    .order('brand_name')

  if (allowedCatIds.length > 0) {
    // brand must belong to at least one allowed category (primary OR secondary)
    q = q.or(
      `category_id.in.(${allowedCatIds.join(',')}),category1_id.in.(${allowedCatIds.join(',')})`,
    )
  }

  const { data: brands, error: brandErr } = await q
  if (brandErr) return { data: null, error: brandErr.message }
  if (!brands || brands.length === 0) return { data: [], error: null }

  // ── 3. Find brands already allocated in racks of same type ──
  // Step 3a: collect IDs of all racks with same rack_type_id
  let allocatedSet = new Map<string, string>()   // brandId → binAddress

  if (rack.rack_type_id) {
    const { data: sameTypeRacks } = await supabase
      .from('racks')
      .select('id')
      .eq('rack_type_id', rack.rack_type_id)

    const sameTypeRackIds = (sameTypeRacks ?? []).map((r: { id: string }) => r.id)

    if (sameTypeRackIds.length > 0) {
      const { data: occupiedSlots } = await supabase
        .from('slots')
        .select('allocated_brand_id, bin_address')
        .in('rack_id', sameTypeRackIds)
        .not('allocated_brand_id', 'is', null)

      for (const s of occupiedSlots ?? []) {
        if (s.allocated_brand_id)
          allocatedSet.set(s.allocated_brand_id, s.bin_address)
      }
    }
  }

  // ── 4. Merge allocation status into brand list ───────────────
  const result: AllocatableBrand[] = (brands as {
    id: string
    brand_code: string
    brand_name: string
    bpu: number | null
    category_id: string | null
    category1_id: string | null
  }[]).map(b => ({
    ...b,
    isAllocatedInType: allocatedSet.has(b.id),
    allocatedAt: allocatedSet.get(b.id) ?? null,
  }))

  return { data: result, error: null }
}

// ── Allocation write operations ────────────────────────────────

/**
 * Allocates a brand to a slot.
 * The DB trigger `slots_check_brand_uniqueness` enforces the
 * one-brand-per-rack-type rule; error code '23505' indicates
 * a conflict that should be shown to the user.
 */
export async function allocateBrandToSlot(
  slotId: string,
  brandId: string,
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('slots')
    .update({ allocated_brand_id: brandId })
    .eq('id', slotId)

  if (!error) return { error: null }

  // Friendly message for the uniqueness trigger violation
  if (error.code === '23505' || error.message.includes('already allocated')) {
    return { error: 'This brand is already allocated to a slot in this rack type.' }
  }

  return { error: error.message }
}

/**
 * Moves a brand from its current slot (within the same rack type) to a new slot.
 * Steps:
 *   1. Find the slot that currently holds the brand within racks of the same type.
 *   2. Clear it (set allocated_brand_id = NULL) to satisfy the uniqueness trigger.
 *   3. Allocate the brand to the new slot.
 */
export async function moveBrandToSlot(
  newSlotId: string,
  brandId: string,
  rackTypeId: string,
): Promise<AllocationResult> {
  // Racks of the same type
  const { data: sameTypeRacks, error: rackErr } = await supabase
    .from('racks')
    .select('id')
    .eq('rack_type_id', rackTypeId)

  if (rackErr) return { error: rackErr.message }

  const rackIds = (sameTypeRacks ?? []).map((r: { id: string }) => r.id)

  // Find the slot currently holding this brand in the same type (skip newSlotId)
  const { data: oldSlot } = await supabase
    .from('slots')
    .select('id')
    .in('rack_id', rackIds)
    .eq('allocated_brand_id', brandId)
    .neq('id', newSlotId)
    .maybeSingle()

  if (oldSlot) {
    const { error: clearErr } = await supabase
      .from('slots')
      .update({ allocated_brand_id: null })
      .eq('id', oldSlot.id)
    if (clearErr) return { error: clearErr.message }
  }

  return allocateBrandToSlot(newSlotId, brandId)
}

/**
 * Removes the brand allocation from a slot (sets allocated_brand_id = NULL).
 */
export async function deallocateSlot(slotId: string): Promise<AllocationResult> {
  const { error } = await supabase
    .from('slots')
    .update({ allocated_brand_id: null })
    .eq('id', slotId)

  return { error: error?.message ?? null }
}

/**
 * Marks a slot as expansion_reserved with a flow direction.
 * The DB trigger will reject this if the slot already has a brand.
 */
export async function setSlotExpansion(
  slotId: string,
  direction: 'above' | 'below' | 'left' | 'right',
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('slots')
    .update({ slot_state: 'expansion_reserved', expansion_direction: direction, allocated_brand_id: null })
    .eq('id', slotId)

  if (!error) return { error: null }
  if (error.code === '23514') return { error: 'Slot already has a brand. Deallocate it first.' }
  return { error: error.message }
}

/**
 * Resets a slot to 'empty' — clears brand, state, direction, and light.
 */
export async function resetSlot(slotId: string): Promise<AllocationResult> {
  const { error } = await supabase
    .from('slots')
    .update({ allocated_brand_id: null, slot_state: 'empty', expansion_direction: null })
    .eq('id', slotId)

  return { error: error?.message ?? null }
}

/**
 * Updates the light_address of a slot.
 */
export async function updateSlotLightAddress(
  slotId: string,
  lightAddress: string | null,
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('slots')
    .update({ light_address: lightAddress })
    .eq('id', slotId)

  return { error: error?.message ?? null }
}

// ── Replanning ─────────────────────────────────────────────────

/**
 * Returns true if a replanning draft already exists for the given rack.
 */
export async function hasReplanning(rackId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('replanning_slots')
    .select('id', { count: 'exact', head: true })
    .eq('rack_id', rackId)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

/**
 * Returns the set of rack IDs that currently have an active replanning draft.
 * Used to badge racks on initial load.
 */
export async function getReplanningRackIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('replanning_slots')
    .select('rack_id')
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r: { rack_id: string }) => r.rack_id))
}

/**
 * Initialises a blank replanning draft for a rack.
 * Copies physical structure (column_letter, row_number, bin_address) from live
 * slots — all brands, lights and expansion start as NULL / empty.
 * Throws if a draft already exists.
 */
export async function startReplanning(rackId: string): Promise<AllocationResult> {
  // Fetch physical structure AND hardware addresses — light_address is tied to the slot
  // position, not the brand, so it must survive the blank-slate initialization.
  const { data: slots, error: slotErr } = await supabase
    .from('slots')
    .select('column_letter, row_number, bin_address, light_address')
    .eq('rack_id', rackId)
    .order('column_letter')
    .order('row_number')
  if (slotErr) return { error: slotErr.message }
  if (!slots || slots.length === 0) return { error: 'No slots found for this rack.' }

  const { error: insertErr } = await supabase
    .from('replanning_slots')
    .insert(
      slots.map((s: { column_letter: string; row_number: number; bin_address: string; light_address: string | null }) => ({
        rack_id: rackId,
        column_letter: s.column_letter,
        row_number: s.row_number,
        bin_address: s.bin_address,
        allocated_brand_id: null,
        // Preserve hardware address; status stays 'off' because no brand is assigned yet.
        light_address: s.light_address,
        light_status: 'off',
        slot_state: 'empty',
        expansion_direction: null,
      }))
    )
  return { error: insertErr?.message ?? null }
}

/**
 * Discards all replanning draft slots for a rack.
 */
export async function discardReplanning(rackId: string): Promise<AllocationResult> {
  const { error } = await supabase
    .from('replanning_slots')
    .delete()
    .eq('rack_id', rackId)
  return { error: error?.message ?? null }
}

// ── Replanning types & read ────────────────────────────────────

export interface ReplanningAllocatableBrand extends AllocatableBrand {
  /** true → brand is already placed in THIS rack's replanning draft */
  isAllocatedInDraft: boolean
  /** bin address in the draft where it sits, if any */
  draftAllocatedAt: string | null
}

/**
 * Loads all replanning_slots for a rack with brand join.
 */
export async function getReplanningSlots(
  rackId: string,
): Promise<{ data: unknown[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('replanning_slots')
    .select('id, rack_id, column_letter, row_number, bin_address, allocated_brand_id, slot_state, expansion_direction, light_address, light_status, brand:allocated_brand_id(brand_code, brand_name, bpu, category:category_id(name), category1:category1_id(name))')
    .eq('rack_id', rackId)
    .order('column_letter')
    .order('row_number')
  return { data, error: error?.message ?? null }
}

/**
 * Returns brands eligible for a replanning draft slot.
 * Flags both official allocation (isAllocatedInType / allocatedAt)
 * and draft allocation within this rack (isAllocatedInDraft / draftAllocatedAt).
 */
export async function getBrandsForReplanning(
  rackId: string,
): Promise<{ data: ReplanningAllocatableBrand[] | null; error: string | null }> {
  const { data: rack, error: rackErr } = await supabase
    .from('racks')
    .select('id, rack_type_id, rack_allowed_categories(category_id)')
    .eq('id', rackId)
    .single()
  if (rackErr || !rack) return { data: null, error: rackErr?.message ?? 'Rack not found' }

  const allowedCatIds: string[] = (
    rack.rack_allowed_categories as { category_id: string }[]
  ).map(c => c.category_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('brands')
    .select('id, brand_code, brand_name, bpu, category_id, category1_id')
    .eq('is_active', true)
    .order('brand_name')
  if (allowedCatIds.length > 0) {
    q = q.or(`category_id.in.(${allowedCatIds.join(',')}),category1_id.in.(${allowedCatIds.join(',')})`)
  }
  const { data: brands, error: brandErr } = await q
  if (brandErr) return { data: null, error: brandErr.message }
  if (!brands || brands.length === 0) return { data: [], error: null }

  // Official allocation (same rack type)
  const officialMap = new Map<string, string>()
  if (rack.rack_type_id) {
    const { data: sameTypeRacks } = await supabase
      .from('racks').select('id').eq('rack_type_id', rack.rack_type_id)
    const ids = (sameTypeRacks ?? []).map((r: { id: string }) => r.id)
    if (ids.length > 0) {
      const { data: oSlots } = await supabase
        .from('slots').select('allocated_brand_id, bin_address')
        .in('rack_id', ids).not('allocated_brand_id', 'is', null)
      for (const s of oSlots ?? [])
        if (s.allocated_brand_id) officialMap.set(s.allocated_brand_id, s.bin_address)
    }
  }

  // Draft allocation (this rack's replanning_slots only)
  const draftMap = new Map<string, string>()
  const { data: dSlots } = await supabase
    .from('replanning_slots').select('allocated_brand_id, bin_address')
    .eq('rack_id', rackId).not('allocated_brand_id', 'is', null)
  for (const s of dSlots ?? [])
    if (s.allocated_brand_id) draftMap.set(s.allocated_brand_id, s.bin_address)

  const result: ReplanningAllocatableBrand[] = (brands as {
    id: string; brand_code: string; brand_name: string
    bpu: number | null; category_id: string | null; category1_id: string | null
  }[]).map(b => ({
    ...b,
    isAllocatedInType:  officialMap.has(b.id),
    allocatedAt:        officialMap.get(b.id) ?? null,
    isAllocatedInDraft: draftMap.has(b.id),
    draftAllocatedAt:   draftMap.get(b.id) ?? null,
  }))

  return { data: result, error: null }
}

// ── Replanning write operations ────────────────────────────────

export async function allocateBrandToReplanningSlot(
  slotId: string,
  brandId: string,
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('replanning_slots')
    .update({ allocated_brand_id: brandId })
    .eq('id', slotId)
  return { error: error?.message ?? null }
}

/**
 * Moves a brand within a rack's replanning draft.
 * Clears the old draft slot first (no cross-rack-type uniqueness in replanning).
 */
export async function moveBrandInReplanning(
  newSlotId: string,
  brandId: string,
  rackId: string,
): Promise<AllocationResult> {
  const { data: oldSlot } = await supabase
    .from('replanning_slots')
    .select('id')
    .eq('rack_id', rackId)
    .eq('allocated_brand_id', brandId)
    .neq('id', newSlotId)
    .maybeSingle()
  if (oldSlot) {
    const { error: clearErr } = await supabase
      .from('replanning_slots')
      .update({ allocated_brand_id: null })
      .eq('id', oldSlot.id)
    if (clearErr) return { error: clearErr.message }
  }
  return allocateBrandToReplanningSlot(newSlotId, brandId)
}

export async function resetReplanningSlot(slotId: string): Promise<AllocationResult> {
  const { error } = await supabase
    .from('replanning_slots')
    .update({ allocated_brand_id: null, slot_state: 'empty', expansion_direction: null })
    .eq('id', slotId)
  return { error: error?.message ?? null }
}

export async function setReplanningSlotExpansion(
  slotId: string,
  direction: 'above' | 'below' | 'left' | 'right',
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('replanning_slots')
    .update({ slot_state: 'expansion_reserved', expansion_direction: direction, allocated_brand_id: null })
    .eq('id', slotId)
  if (!error) return { error: null }
  if (error.code === '23514') return { error: 'Slot already has a brand. Deallocate it first.' }
  return { error: error.message }
}

export async function updateReplanningSlotLightAddress(
  slotId: string,
  lightAddress: string | null,
): Promise<AllocationResult> {
  const { error } = await supabase
    .from('replanning_slots')
    .update({ light_address: lightAddress, light_status: lightAddress ? 'on' : 'off' })
    .eq('id', slotId)
  return { error: error?.message ?? null }
}

/**
 * Returns the set of brand IDs that are already placed in an active replanning
 * draft for any rack of the given type — EXCLUDING the specified rack.
 * Used by the checklist panel to cross-mark brands allocated in sibling drafts.
 */
export async function getCrossTypeDraftBrandIds(
  rackTypeId: string,
  excludeRackId: string,
): Promise<Set<string>> {
  const { data: sameTypeRacks } = await supabase
    .from('racks')
    .select('id')
    .eq('rack_type_id', rackTypeId)
    .neq('id', excludeRackId)

  const ids = (sameTypeRacks ?? []).map((r: { id: string }) => r.id)
  if (ids.length === 0) return new Set()

  const { data: draftSlots } = await supabase
    .from('replanning_slots')
    .select('allocated_brand_id')
    .in('rack_id', ids)
    .not('allocated_brand_id', 'is', null)

  return new Set(
    (draftSlots ?? []).map((s: { allocated_brand_id: string }) => s.allocated_brand_id),
  )
}

// ── Checklist panel data ────────────────────────────────────────

export interface OfficialBrandItem {
  brand_id: string
  brand_code: string
  brand_name: string
  bin_address: string
  rack_id: string
  rack_name: string
}

/**
 * Returns all brand-allocated slots across every rack of a given type.
 * Used to build the global checklist panel in PLReplanningView.
 */
export async function getOfficialBrandsByRackType(
  rackTypeId: string,
): Promise<{ data: OfficialBrandItem[] | null; error: string | null }> {
  // 1. Collect rack IDs for this type
  const { data: racks, error: rackErr } = await supabase
    .from('racks')
    .select('id, name')
    .eq('rack_type_id', rackTypeId)
    .eq('active', true)

  if (rackErr) return { data: null, error: rackErr.message }
  const rackIds = (racks ?? []).map((r: { id: string }) => r.id)
  if (rackIds.length === 0) return { data: [], error: null }

  const rackNameMap = new Map<string, string>(
    (racks ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  )

  // 2. Fetch all brand_allocated slots in those racks
  const { data: slots, error: slotErr } = await supabase
    .from('slots')
    .select('allocated_brand_id, bin_address, rack_id, brand:allocated_brand_id(brand_code, brand_name)')
    .in('rack_id', rackIds)
    .eq('slot_state', 'brand_allocated')
    .not('allocated_brand_id', 'is', null)

  if (slotErr) return { data: null, error: slotErr.message }

  type SlotRow = {
    allocated_brand_id: string
    bin_address: string
    rack_id: string
    brand: { brand_code: string; brand_name: string } | null
  }

  const items: OfficialBrandItem[] = ((slots ?? []) as unknown as SlotRow[])
    .filter(s => s.brand)
    .map(s => ({
      brand_id:   s.allocated_brand_id,
      brand_code: s.brand!.brand_code,
      brand_name: s.brand!.brand_name,
      bin_address: s.bin_address,
      rack_id:    s.rack_id,
      rack_name:  rackNameMap.get(s.rack_id) ?? s.rack_id,
    }))
    .sort((a, b) => a.brand_code.localeCompare(b.brand_code))

  return { data: items, error: null }
}

/**
 * Returns the set of brand IDs placed in ANY active replanning draft
 * for racks of the given type (all racks, no exclusion).
 * Refreshed after every draft mutation to keep strikethrough in sync.
 */
export async function getAllDraftBrandIdsForRackType(
  rackTypeId: string,
): Promise<Set<string>> {
  const { data: racks } = await supabase
    .from('racks')
    .select('id')
    .eq('rack_type_id', rackTypeId)

  const rackIds = (racks ?? []).map((r: { id: string }) => r.id)
  if (rackIds.length === 0) return new Set()

  const { data: drafts } = await supabase
    .from('replanning_slots')
    .select('allocated_brand_id')
    .in('rack_id', rackIds)
    .not('allocated_brand_id', 'is', null)

  return new Set(
    (drafts ?? []).map((s: { allocated_brand_id: string }) => s.allocated_brand_id),
  )
}
