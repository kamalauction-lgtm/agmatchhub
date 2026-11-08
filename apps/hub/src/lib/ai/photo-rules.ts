/**
 * Photo Checker — the deterministic floor, from what the database already
 * knows about each photo: dimensions, file size and the perceptual hash the
 * upload pipeline stores (00030). Duplicates and low resolution need no
 * model; blur, faces, plates and documents do (lib/ai/photo-check.ts).
 *
 * Pure, unit-tested.
 */
export type MediaFacts = {
  id: string;
  position: number;
  is_cover: boolean;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  phash: string | null;
};

export type RuleIssue = "low_res" | "tiny_file" | "duplicate";
export type RulePhotoFlag = { id: string; index: number; issues: RuleIssue[]; duplicateOf?: number };

/** Hamming distance between two hex perceptual hashes; Infinity if not comparable. */
export function hamming(a: string | null, b: string | null): number {
  if (!a || !b || a.length !== b.length || !/^[0-9a-f]+$/i.test(a + b)) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const DUPLICATE_THRESHOLD = 6;
export const MIN_WIDTH = 800;
export const MIN_HEIGHT = 600;
export const MIN_BYTES = 40_000;
export const RECOMMENDED_COUNT = 5;

export function ruleCheckPhotos(rows: MediaFacts[]): {
  flags: RulePhotoFlag[];
  count: number;
  hasCover: boolean;
  tooFew: boolean;
} {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const flags: RulePhotoFlag[] = [];
  sorted.forEach((m, i) => {
    const issues: RuleIssue[] = [];
    let duplicateOf: number | undefined;
    if (m.width && m.height && (m.width < MIN_WIDTH || m.height < MIN_HEIGHT)) issues.push("low_res");
    if (m.byte_size != null && m.byte_size > 0 && m.byte_size < MIN_BYTES) issues.push("tiny_file");
    for (let j = 0; j < i; j++) {
      if (hamming(m.phash, sorted[j].phash) <= DUPLICATE_THRESHOLD) { issues.push("duplicate"); duplicateOf = j + 1; break; }
    }
    if (issues.length) flags.push({ id: m.id, index: i + 1, issues, duplicateOf });
  });
  return {
    flags,
    count: sorted.length,
    hasCover: sorted.some((m) => m.is_cover),
    tooFew: sorted.length < RECOMMENDED_COUNT,
  };
}
