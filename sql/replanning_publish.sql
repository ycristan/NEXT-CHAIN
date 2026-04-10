-- ════════════════════════════════════════════════════════════════
-- replanning_publish.sql
-- Atomic function: copies replanning_slots → slots, deletes draft.
-- Callable via supabase.rpc('publish_replanning', { p_rack_id }).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.publish_replanning(p_rack_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rack_type_id UUID;
BEGIN
  -- ── Security: admin only ───────────────────────────────────────
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can publish a replanning draft'
      USING ERRCODE = '42501';
  END IF;

  -- Confirm a draft exists for this rack
  IF NOT EXISTS (SELECT 1 FROM public.replanning_slots WHERE rack_id = p_rack_id) THEN
    RAISE EXCEPTION 'No replanning draft found for this rack'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT rack_type_id INTO v_rack_type_id FROM public.racks WHERE id = p_rack_id;

  -- ── Step 1: Clear brand/state data from live slots ─────────────
  -- light_address is NOT cleared — it is hardware-bound (physical position),
  -- not brand-bound, so it must survive the reset and remain as a fallback
  -- in Step 3's COALESCE in case the draft somehow has a NULL address.
  UPDATE public.slots
  SET allocated_brand_id  = NULL,
      slot_state          = 'empty',
      expansion_direction = NULL,
      light_status        = 'off'
  WHERE rack_id = p_rack_id;

  -- ── Step 2: Release brands from OTHER racks of the same type ──
  -- Brands that appear in the draft may currently sit in a different
  -- rack of the same type. Remove them so the uniqueness trigger
  -- passes when we apply the draft in Step 3.
  IF v_rack_type_id IS NOT NULL THEN
    UPDATE public.slots s
    SET allocated_brand_id  = NULL,
        slot_state          = 'empty',
        expansion_direction = NULL
    WHERE s.allocated_brand_id IN (
      SELECT rs.allocated_brand_id
      FROM   public.replanning_slots rs
      WHERE  rs.rack_id = p_rack_id
        AND  rs.allocated_brand_id IS NOT NULL
    )
    AND s.rack_id IN (
      SELECT id FROM public.racks
      WHERE  rack_type_id = v_rack_type_id
        AND  id <> p_rack_id
    );
  END IF;

  -- ── Step 3: Apply replanning data to live slots ────────────────
  -- Matches on (column_letter, row_number) — same physical address.
  -- light_address: use the draft value if the user edited it during planning;
  -- fall back to whatever the live slot still has (preserved in Step 1) so
  -- that hardware addresses are NEVER lost even if a draft slot has NULL.
  UPDATE public.slots s
  SET allocated_brand_id  = rs.allocated_brand_id,
      light_address       = COALESCE(rs.light_address, s.light_address),
      light_status        = rs.light_status,
      slot_state          = rs.slot_state,
      expansion_direction = rs.expansion_direction
  FROM public.replanning_slots rs
  WHERE s.rack_id        = p_rack_id
    AND rs.rack_id       = p_rack_id
    AND s.column_letter  = rs.column_letter
    AND s.row_number     = rs.row_number;

  -- ── Step 4: Delete the replanning draft ───────────────────────
  DELETE FROM public.replanning_slots WHERE rack_id = p_rack_id;

END;
$$;

-- Grant execute to authenticated users (function enforces admin check internally)
GRANT EXECUTE ON FUNCTION public.publish_replanning(UUID) TO authenticated;
