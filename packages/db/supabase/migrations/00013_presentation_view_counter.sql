-- 00013 — Atomic view counter for client presentations (called by service role)
create or replace function public.increment_presentation_views(p_presentation_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.client_presentations
     set view_count = view_count + 1
   where id = p_presentation_id;
$$;
revoke execute on function public.increment_presentation_views(uuid) from public, anon, authenticated;
