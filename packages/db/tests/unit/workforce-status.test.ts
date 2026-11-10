import { describe, it, expect } from "vitest";
import {
  roleAccess,
  roleEngine,
  summariseWorkforce,
  type WorkforceModel,
  type WorkforceRole,
} from "../../../../apps/hub/src/lib/ai/workforce-status-rules";

/** The AI Workforce page must not call a role "live with AI" when only its screen exists. */

const role = (over: Partial<WorkforceRole>): WorkforceRole => ({
  key: "x", status: "live", route: "/x", external_url: null, feature: null, ...over,
});
const model = (over: Partial<WorkforceModel>): WorkforceModel => ({
  feature: "f", provider: "gemini", fallback_provider: null, enabled: true, ...over,
});

describe("role access", () => {
  it("opens live routed roles only for verified agents", () => {
    expect(roleAccess(role({}), { verified: true, heroLinked: false })).toBe("open");
    expect(roleAccess(role({}), { verified: false, heroLinked: false })).toBe("unavailable");
  });
  it("keeps Hero-hosted roles behind the Hero link", () => {
    const hero = role({ route: null, external_url: "https://hero.example/coach" });
    expect(roleAccess(hero, { verified: true, heroLinked: false })).toBe("hero");
    expect(roleAccess(hero, { verified: true, heroLinked: true })).toBe("hero_open");
  });
  it("calls everything else planned, whatever its status says", () => {
    expect(roleAccess(role({ status: "planned", route: null }), { verified: true, heroLinked: true })).toBe("planned");
    expect(roleAccess(role({ status: "live", route: null }), { verified: true, heroLinked: true })).toBe("planned");
  });
});

describe("role engine", () => {
  const noKey = () => false;
  it("is AI only when a routed provider has a key in this deployment", () => {
    expect(roleEngine(role({ feature: "f" }), model({}), (p) => p === "gemini")).toBe("ai");
    expect(roleEngine(role({ feature: "f" }), model({}), noKey)).toBe("rules");
    expect(roleEngine(role({ feature: "f" }), model({ fallback_provider: "anthropic" }), (p) => p === "anthropic")).toBe("ai");
  });
  it("is rules-by-design when no model is routed", () => {
    expect(roleEngine(role({ feature: null }), undefined, () => true)).toBe("rules_by_design");
    expect(roleEngine(role({ feature: "f" }), model({ provider: "none" }), () => true)).toBe("rules_by_design");
    expect(roleEngine(role({ feature: "f" }), model({ enabled: false }), () => true)).toBe("rules_by_design");
    expect(roleEngine(role({ feature: "f" }), undefined, () => true)).toBe("rules_by_design");
  });
});

describe("workforce summary", () => {
  it("separates roles that open from roles a model answers for", () => {
    const roles = [
      role({ key: "a", feature: "brief" }),
      role({ key: "b", feature: "coach" }),
      role({ key: "c" }),
      role({ key: "d", status: "planned", route: null }),
      role({ key: "h", route: null, external_url: "https://hero.example" }),
      role({ key: "z", status: "hidden" }),
    ];
    const models = [model({ feature: "brief" }), model({ feature: "coach", provider: "none" })];
    const s = summariseWorkforce(roles, models, { verified: true, heroLinked: false }, () => false);
    expect(s).toEqual({ total: 5, open: 3, aiConnected: 0, rulesOnly: 1, rulesByDesign: 4 });
    const withKey = summariseWorkforce(roles, models, { verified: false, heroLinked: false }, () => true);
    expect(withKey.open).toBe(0);
    expect(withKey.aiConnected).toBe(1);
  });
});
