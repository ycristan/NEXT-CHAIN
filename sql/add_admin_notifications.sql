-- ============================================================
-- admin_notifications
-- Stores deletion (and future action) requests from non-admin
-- users, to be reviewed and actioned by an admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_by  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type   TEXT         NOT NULL,          -- e.g. 'delete_brand'
  target_id     UUID,                           -- id of the resource (e.g. brands.id)
  target_name   TEXT,                           -- human-readable label for display
  objective     TEXT         NOT NULL,
  justification TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_by   UUID         REFERENCES auth.users(id),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can INSERT their own requests
CREATE POLICY "Users can create notifications"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Users can see their own requests; admins can see all
CREATE POLICY "Users see own; admins see all"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update (resolve / dismiss)
CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
