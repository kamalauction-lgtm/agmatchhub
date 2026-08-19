-- =============================================================================
-- 00053 — Digital name card: public read of opted-in social links
--
-- The benchmark called this the cheapest win (docs/benchmark-agent-dashboards
-- §"Digital name card"): everything the card shows already exists — the trust
-- profile (00019), the public agent card view (00050), the profile photo in a
-- public bucket. The only missing piece is a public projection of the social
-- links an agent has explicitly set to 'public_profile' visibility.
--
-- Deliberate choices:
--   * visibility = 'public_profile' ONLY — the agent's own opt-in, chosen on
--     the profile screen. 'collaborators' and 'after_contact_release' links
--     never appear here; those gates live in 00019's policies.
--   * verification_status: 'rejected' and 'hidden' are excluded, but
--     'unverified' is allowed. Agents cannot self-verify and admin link
--     verification is rare — requiring it would keep every card empty. The
--     card is the agent's own marketing surface; the verified tick on links
--     can become a badge later.
--   * verified agents only, same rule as public_agent_profiles.
-- =============================================================================

create view public.public_agent_social_links with (security_invoker = false) as
select
  l.user_id,
  l.platform,
  l.url,
  l.display_label,
  (l.verification_status = 'verified') as is_verified
from public.agent_social_links l
join public.profiles p on p.id = l.user_id
where p.agent_status = 'verified'
  and l.visibility = 'public_profile'
  and l.verification_status not in ('rejected', 'hidden');

comment on view public.public_agent_social_links is
  'Social links an agent explicitly published to their public card (visibility public_profile). Everything else stays behind 00019''s collaborator gates.';

-- Grants stay explicit (the 00050 lesson: Supabase defaults hand anon ALL).
revoke all on public.public_agent_social_links from anon, authenticated;
grant select on public.public_agent_social_links to anon, authenticated;
