/**
 * 3D identity sheet for the AI workforce — all 36 original characters.
 *
 * Every specialist keeps the identity the owner's six character sheets
 * define: name, face, hair, costume and accessories. This file describes how
 * the procedural 3D body of each specialist is dressed so the figure reads as
 * THAT character at a glance — never a generic stand-in. Keys are
 * `ai_roles.key`; `persona` is checked against `ai_role_personas.name` by
 * `packages/db/tests/integration/ai-office-roster.test.ts` (36/36 on staging,
 * 2026-11-10).
 *
 * Stage 1 (accepted 2026-11-10): Astra, Luna, Kael. Stage 2: the other 33.
 */
export type HairStyle = "bun" | "long" | "short" | "ponytail" | "bob" | "swept" | "curly";
export type Accessory = "glasses" | "visor" | "goggles" | "headphones" | "earrings" | "scarf" | "tie" | "backpack";

export type Identity3D = {
  persona: string;
  /** Sheet the character comes from (reference grouping only; departments come from ai_roles). */
  sheet: 1 | 2 | 3 | 4 | 5 | 6;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Main costume colour (the shared white/grey uniform, with per-character tint). */
  suit: string;
  /** Character accent (ear device glow, trims, emblem). */
  accent: string;
  eyes: string;
  accessories?: Accessory[];
  build: "slim" | "regular" | "broad";
};

const UNIFORM = "#f2f5fb";
const UNIFORM_WARM = "#f4f3fa";
const UNIFORM_COOL = "#eef2f8";

export const IDENTITY_3D: Record<string, Identity3D> = {
  // ─── Sheet 1 — Administration & Leads ───────────────────────────────────
  ai_manager:          { persona: "Astra", sheet: 1, skin: "#f0c7ad", hair: "#3a2420", hairStyle: "bun",      suit: UNIFORM,      accent: "#3b82f6", eyes: "#4b3a33", build: "regular" },
  owner_report_writer: { persona: "Nova",  sheet: 1, skin: "#f1c9b0", hair: "#2b1f26", hairStyle: "bun",      suit: UNIFORM,      accent: "#3b82f6", eyes: "#3b3a4a", accessories: ["glasses"], build: "slim" },
  document_summariser: { persona: "Lyra",  sheet: 1, skin: "#f3d0ba", hair: "#d9d6e6", hairStyle: "bun",      suit: UNIFORM_WARM, accent: "#a78bfa", eyes: "#6d4fa3", build: "slim" },
  lead_qualifier:      { persona: "Zayn",  sheet: 1, skin: "#e9bf9f", hair: "#6b4a2f", hairStyle: "short",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#4a3a2e", build: "regular" },
  duplicate_detector:  { persona: "Vex",   sheet: 1, skin: "#efc3a8", hair: "#1c1c2e", hairStyle: "ponytail", suit: UNIFORM_COOL, accent: "#38bdf8", eyes: "#2f3b55", accessories: ["visor"], build: "slim" },
  silence_radar:       { persona: "Echo",  sheet: 1, skin: "#e6ba9b", hair: "#c9c9d6", hairStyle: "swept",    suit: UNIFORM_COOL, accent: "#22d3ee", eyes: "#3a3f55", build: "regular" },

  // ─── Sheet 2 — Messaging & Marketing ────────────────────────────────────
  reply_drafter:       { persona: "Mira",  sheet: 2, skin: "#f1c8ae", hair: "#3b2622", hairStyle: "bun",      suit: UNIFORM,      accent: "#3b82f6", eyes: "#4a3630", build: "slim" },
  followup_scheduler:  { persona: "Tempo", sheet: 2, skin: "#f3cfb8", hair: "#e8e6f0", hairStyle: "bun",      suit: UNIFORM_WARM, accent: "#60a5fa", eyes: "#5b5b8a", accessories: ["glasses"], build: "slim" },
  email_composer:      { persona: "Orion", sheet: 2, skin: "#e8bd9e", hair: "#16141c", hairStyle: "short",    suit: UNIFORM_COOL, accent: "#3b82f6", eyes: "#2d2a33", accessories: ["tie"], build: "regular" },
  listing_copywriter:  { persona: "Luna",  sheet: 2, skin: "#f3cdb6", hair: "#5b2d7a", hairStyle: "long",     suit: UNIFORM_WARM, accent: "#a78bfa", eyes: "#5a3a5e", accessories: ["earrings"], build: "slim" },
  caption_writer:      { persona: "Kira",  sheet: 2, skin: "#f2c9b0", hair: "#8b4fbf", hairStyle: "bob",      suit: UNIFORM_WARM, accent: "#e879f9", eyes: "#6a3f7a", accessories: ["headphones"], build: "slim" },
  brochure_writer:     { persona: "Atlas", sheet: 2, skin: "#e9c0a2", hair: "#9a9aa6", hairStyle: "swept",    suit: UNIFORM,      accent: "#e3c66f", eyes: "#3a3a45", accessories: ["glasses"], build: "regular" },

  // ─── Sheet 3 — Matching & Appointments ──────────────────────────────────
  property_matcher:    { persona: "Vega",  sheet: 3, skin: "#f0c6ab", hair: "#141424", hairStyle: "bob",      suit: UNIFORM,      accent: "#3b82f6", eyes: "#2a2a3c", build: "slim" },
  buyer_profiler:      { persona: "Sora",  sheet: 3, skin: "#f5d3bd", hair: "#e6d3b3", hairStyle: "bun",      suit: UNIFORM_WARM, accent: "#60a5fa", eyes: "#4a6a9a", accessories: ["glasses"], build: "slim" },
  alternative_finder:  { persona: "Niko",  sheet: 3, skin: "#e7bc9c", hair: "#3a2a22", hairStyle: "short",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#3a2c24", build: "regular" },
  task_planner:        { persona: "Kael",  sheet: 3, skin: "#edc3a6", hair: "#1f1b2a", hairStyle: "short",    suit: UNIFORM_COOL, accent: "#22d3ee", eyes: "#2f2a33", accessories: ["glasses"], build: "regular" },
  viewing_coordinator: { persona: "Ivy",   sheet: 3, skin: "#f1c7ac", hair: "#5a3a28", hairStyle: "long",     suit: UNIFORM,      accent: "#2563eb", eyes: "#4a3a2e", accessories: ["scarf"], build: "slim" },
  reminder_assistant:  { persona: "Piper", sheet: 3, skin: "#f4cfb9", hair: "#f0a0c0", hairStyle: "curly",    suit: UNIFORM_WARM, accent: "#f6c453", eyes: "#6a4a4a", build: "slim" },

  // ─── Sheet 4 — Research & Property Management ───────────────────────────
  listing_researcher:  { persona: "Scout", sheet: 4, skin: "#f0c6ab", hair: "#1a1a28", hairStyle: "bob",      suit: UNIFORM_COOL, accent: "#38bdf8", eyes: "#2d3550", accessories: ["visor"], build: "slim" },
  owner_outreach:      { persona: "Raya",  sheet: 4, skin: "#edc0a3", hair: "#6a4228", hairStyle: "long",     suit: UNIFORM_WARM, accent: "#e3c66f", eyes: "#4a3424", accessories: ["earrings"], build: "slim" },
  comparables_analyst: { persona: "Quinn", sheet: 4, skin: "#e8be9f", hair: "#2a2230", hairStyle: "short",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#2e2a36", build: "regular" },
  quality_auditor:     { persona: "Halo",  sheet: 4, skin: "#f3cdb6", hair: "#dcdce8", hairStyle: "bob",      suit: UNIFORM_COOL, accent: "#34d399", eyes: "#4a4a5e", accessories: ["headphones"], build: "slim" },
  photo_checker:       { persona: "Pixel", sheet: 4, skin: "#e9c0a2", hair: "#5a3f2c", hairStyle: "short",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#3a3a52", accessories: ["goggles"], build: "regular" },
  refresh_planner:     { persona: "Flux",  sheet: 4, skin: "#f2c9b0", hair: "#6d3fa0", hairStyle: "ponytail", suit: UNIFORM_WARM, accent: "#a78bfa", eyes: "#4f3a6a", build: "slim" },

  // ─── Sheet 5 — Social, Sales & Closing ──────────────────────────────────
  poster_designer:     { persona: "Juno",  sheet: 5, skin: "#f1c8ae", hair: "#3a2826", hairStyle: "bun",      suit: UNIFORM_WARM, accent: "#a78bfa", eyes: "#4a3a3a", build: "slim" },
  video_scriptwriter:  { persona: "Neo",   sheet: 5, skin: "#e9c0a2", hair: "#2a2030", hairStyle: "swept",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#2e2a36", build: "regular" },
  social_planner:      { persona: "Solis", sheet: 5, skin: "#f4d0ba", hair: "#d8d6ea", hairStyle: "long",     suit: UNIFORM_COOL, accent: "#60a5fa", eyes: "#4a5a8a", build: "slim" },
  objection_coach:     { persona: "Titan", sheet: 5, skin: "#e6b996", hair: "#1f1a24", hairStyle: "short",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#2d2a33", build: "broad" },
  offer_summariser:    { persona: "Clara", sheet: 5, skin: "#f2cab2", hair: "#5a3a2a", hairStyle: "bun",      suit: UNIFORM_WARM, accent: "#e3c66f", eyes: "#4a3a2e", accessories: ["glasses", "earrings"], build: "slim" },
  closing_checklist:   { persona: "Finn",  sheet: 5, skin: "#f0c6ab", hair: "#b8905a", hairStyle: "short",    suit: UNIFORM,      accent: "#2563eb", eyes: "#3a4a6a", build: "regular" },

  // ─── Sheet 6 — Teams & Global Collaboration ─────────────────────────────
  team_coach:          { persona: "Aria",  sheet: 6, skin: "#f1c8ae", hair: "#6a4530", hairStyle: "bun",      suit: UNIFORM,      accent: "#3b82f6", eyes: "#3a4a7a", build: "slim" },
  onboarding_guide:    { persona: "Rio",   sheet: 6, skin: "#e9c0a2", hair: "#2a2230", hairStyle: "short",    suit: UNIFORM_COOL, accent: "#38bdf8", eyes: "#2e2a36", accessories: ["backpack"], build: "regular" },
  performance_reviewer:{ persona: "Prism", sheet: 6, skin: "#f3cdb6", hair: "#b8a6e0", hairStyle: "bob",      suit: UNIFORM_WARM, accent: "#a78bfa", eyes: "#5a4a8a", accessories: ["visor"], build: "slim" },
  crossborder_researcher:{ persona: "Cosmo", sheet: 6, skin: "#ecc3a4", hair: "#a37a4a", hairStyle: "curly",  suit: "#e8e2d4",    accent: "#38bdf8", eyes: "#3a5a8a", accessories: ["goggles", "backpack"], build: "regular" },
  translation_assistant:{ persona: "Mila", sheet: 6, skin: "#f1c8ae", hair: "#3a2622", hairStyle: "long",     suit: UNIFORM_WARM, accent: "#a78bfa", eyes: "#4a3630", build: "slim" },
  partner_finder:      { persona: "Link",  sheet: 6, skin: "#e9c0a2", hair: "#22202a", hairStyle: "short",    suit: UNIFORM,      accent: "#3b82f6", eyes: "#2e2a36", build: "regular" },
};

export const IDENTITY_COUNT = Object.keys(IDENTITY_3D).length;
