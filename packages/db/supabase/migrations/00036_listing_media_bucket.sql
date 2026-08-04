-- =============================================================================
-- 00036 — Storage bucket for marketplace listing media
--
-- PUBLIC bucket, deliberately: published listing photos are public content
-- served straight from the CDN path apps/www already builds
-- (/storage/v1/object/public/...). Everything sensitive (identity documents,
-- verification files, co-broke property media) stays in the private buckets
-- from 00002/00007 — never mix the two (§16 file rules).
--
-- Write access follows the owner-folder convention used by every other
-- bucket: the first path segment must be the uploader's user id.
--
-- MVP shortcut, recorded honestly: images are uploaded as-is and marked
-- ready; the processing pipeline (EXIF/GPS strip, compression, thumbnails,
-- perceptual hash for duplicate detection) is a separate pre-launch
-- requirement. Agent camera photos can carry GPS coordinates, so this MUST
-- exist before real public launch — tracked in the risk register (§19,
-- metadata removal).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media-public',
  'listing-media-public',
  true,
  10 * 1024 * 1024,                          -- 10 MB per image
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "listing media owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-media-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing media owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-media-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-media-public'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())
  );

-- Public bucket: reads go through the public object URL; no select policy
-- needed for anonymous CDN access.
