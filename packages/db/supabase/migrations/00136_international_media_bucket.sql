-- 00136: where international listing photos live.
--
-- PUBLIC bucket, like listing-media-public (00036): a published project's
-- photos are public content served straight from the storage CDN path. Photos
-- are copied here by the sync and re-encoded on the way in, which drops any
-- camera or location metadata; they are never hot-linked from the source.
--
-- No storage policies on purpose: nobody signed in writes here. Only the sync,
-- with the service role, adds or removes objects. Reads need no policy because
-- the bucket is public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'international-media-public',
  'international-media-public',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
