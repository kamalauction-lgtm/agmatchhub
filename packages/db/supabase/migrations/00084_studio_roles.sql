-- =============================================================================
-- 00084 — AI Marketing Studio roles go live (Stage B, E4 · 7 Nov 2026)
--
-- The Studio's "Write with AI" fills WhatsApp, Instagram, Facebook, TikTok and
-- brochure text from one listing; the two roles that describe exactly that
-- flip to live. The Social Calendar Planner stays planned: a week of posts
-- across listings is a scheduler feature, not yet built.
-- =============================================================================

update public.ai_roles set status = 'live', route = '/studio', updated_at = now()
 where key in ('caption_writer', 'brochure_writer');
