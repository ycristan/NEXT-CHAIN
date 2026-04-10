-- =============================================
-- NEXT CHAIN WMS - Storage: items_images bucket + policies
-- Run this in Supabase SQL Editor
-- =============================================

-- Create the bucket (public = anyone can read URLs)
insert into storage.buckets (id, name, public)
values ('items_images', 'items_images', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload
create policy "items_images_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'items_images');

-- Allow public to read/view images
create policy "items_images_storage_select"
  on storage.objects for select
  to public
  using (bucket_id = 'items_images');

-- Allow authenticated users to delete images
create policy "items_images_storage_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'items_images');

-- Allow authenticated users to replace/update images
create policy "items_images_storage_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'items_images');
