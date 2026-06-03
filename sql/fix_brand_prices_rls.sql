-- ====================================================
-- FIX: brand_prices SELECT policy — scope to client catalog
-- Run in Supabase SQL Editor if order_portal_setup.sql was
-- already executed. If not yet executed, this fix is already
-- included in order_portal_setup.sql.
--
-- Problem: previous policy allowed any client user to SELECT
-- all brand prices, including brands not in their catalog.
-- Fix: restrict to brands present in the client's own catalog.
-- ====================================================

DROP POLICY IF EXISTS "brand_prices_select" ON public.brand_prices;

CREATE POLICY "brand_prices_select" ON public.brand_prices
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND brand_id IN (
      SELECT brand_id FROM public.client_catalogs
      WHERE client_account_id IN (SELECT get_client_account_ids())
    ))
  );
