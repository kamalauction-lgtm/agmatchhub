/**
 * 3D identity sheet for the AI workforce.
 *
 * Every specialist keeps the identity the owner's character sheets define:
 * name, face, hair, costume and accessories. This file describes how the
 * procedural 3D body of a specialist is dressed so the figure is recognisable
 * as THAT character at a glance, never a generic stand-in.
 *
 * Only the three prototype characters have a full 3D body entry for now
 * (Astra, Luna, Kael — owner directive 2026-11-10, step 6). Every other
 * specialist is still present, clickable and in the right department, shown
 * as a holographic identity stand carrying their own portrait until the body
 * system is extended after prototype acceptance (step 7).
 *
 * Keys are `ai_roles.key`; the names are what `ai_role_personas.name` says.
 * Validated 36/36 against staging on 2026-11-10.
 */
export type HairStyle = "bun" | "long" | "short";

export type Identity3D = {
  /** For a sanity check against the persona row — never shown from here. */
  persona: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Main costume colour (all specialists wear the white/grey uniform). */
  suit: string;
  /** Character accent (ear device glow, trims, emblem). */
  accent: string;
  eyes: string;
  glasses?: boolean;
  earrings?: boolean;
  /** Build, as a gentle scale on shoulders/torso. */
  build: "slim" | "regular";
};

export const IDENTITY_3D: Record<string, Identity3D> = {
  // Astra — AI Manager. Dark brown hair in a loose updo with side strands,
  // warm skin, white suit with blue trims, blue ear device.
  ai_manager: {
    persona: "Astra", skin: "#f0c7ad", hair: "#3a2420", hairStyle: "bun",
    suit: "#f2f5fb", accent: "#3b82f6", eyes: "#4b3a33", build: "regular",
  },
  // Luna — Listing Copywriter. Long wavy violet hair, gold hoop earrings,
  // white suit with gold piping, violet accent.
  listing_copywriter: {
    persona: "Luna", skin: "#f3cdb6", hair: "#5b2d7a", hairStyle: "long",
    suit: "#f4f3fa", accent: "#a78bfa", eyes: "#5a3a5e", earrings: true, build: "slim",
  },
  // Kael — Task Planner. Short dark hair, round glasses, grey-white suit
  // with cyan trims, cyan ear device.
  task_planner: {
    persona: "Kael", skin: "#edc3a6", hair: "#1f1b2a", hairStyle: "short",
    suit: "#eef2f8", accent: "#22d3ee", eyes: "#2f2a33", glasses: true, build: "regular",
  },
};

export const PROTOTYPE_KEYS = Object.keys(IDENTITY_3D);
