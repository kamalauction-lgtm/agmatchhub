import { describe, it, expect, vi } from "vitest";
import { allowsEmptyCatalogue, withBuildFallback, BUILD_PHASE } from "../../../../apps/www/src/lib/build-fallback";

/**
 * The marketplace homepage's build-time fallback (PR #2, review finding 2).
 * The fallback may apply ONLY to a CI placeholder build: build phase AND the
 * explicit flag. A genuine release build with an unreachable database must
 * fail; a runtime failure must propagate so ISR keeps the last good page.
 */

const failing = () => Promise.reject(new Error("listing search failed: TypeError: fetch failed"));
const EMPTY = { listings: [] as unknown[], total: 0 };

describe("allowsEmptyCatalogue()", () => {
  it("is true only for build phase + explicit CI flag", () => {
    expect(allowsEmptyCatalogue({ NEXT_PHASE: BUILD_PHASE, WWW_CI_PLACEHOLDER_BUILD: "1" })).toBe(true);
    expect(allowsEmptyCatalogue({ NEXT_PHASE: BUILD_PHASE })).toBe(false);
    expect(allowsEmptyCatalogue({ NEXT_PHASE: BUILD_PHASE, WWW_CI_PLACEHOLDER_BUILD: "true" })).toBe(false);
    expect(allowsEmptyCatalogue({ WWW_CI_PLACEHOLDER_BUILD: "1" })).toBe(false);
    expect(allowsEmptyCatalogue({})).toBe(false);
  });
});

describe("withBuildFallback()", () => {
  it("CI placeholder build: returns the empty catalogue and warns", async () => {
    const warn = vi.fn();
    const out = await withBuildFallback(failing(), EMPTY, { NEXT_PHASE: BUILD_PHASE, WWW_CI_PLACEHOLDER_BUILD: "1" }, warn);
    expect(out).toBe(EMPTY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/CI placeholder build/);
    expect(warn.mock.calls[0][0]).toMatch(/fetch failed/);
  });

  it("genuine production build (no flag): fails closed", async () => {
    const warn = vi.fn();
    await expect(withBuildFallback(failing(), EMPTY, { NEXT_PHASE: BUILD_PHASE }, warn)).rejects.toThrow(/fetch failed/);
    expect(warn).not.toHaveBeenCalled();
  });

  it("runtime (not build phase): propagates even if the flag is set", async () => {
    await expect(
      withBuildFallback(failing(), EMPTY, { WWW_CI_PLACEHOLDER_BUILD: "1" }),
    ).rejects.toThrow(/fetch failed/);
  });

  it("successful reads pass through unchanged in every mode", async () => {
    const data = { listings: [{ id: "x" }], total: 1 };
    for (const env of [{}, { NEXT_PHASE: BUILD_PHASE }, { NEXT_PHASE: BUILD_PHASE, WWW_CI_PLACEHOLDER_BUILD: "1" }]) {
      expect(await withBuildFallback(Promise.resolve(data), EMPTY, env)).toBe(data);
    }
  });
});
