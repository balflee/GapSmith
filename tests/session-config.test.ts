import { describe, it, expect } from "vitest";
import {
  parseSessionConfig,
  summarizeSessionConfig,
  hasSessionConfig,
  serializeSessionConfig,
  SESSION_CONFIG_PROFILES,
  SESSION_CONFIG_BUDGETS,
  SESSION_CONFIG_TIMELINES,
  SESSION_CONFIG_REVENUE_THRESHOLDS,
} from "@/lib/session-config";

const SOLO = `# Session Config

## Project Profile
Profile: Solo
Budget: $1K
Timeline: 3-6 months
Revenue_threshold: $50K/year

## Founder Signal
Signal: 8 years mech eng + 2 years blockchain BD
`;

describe("parseSessionConfig", () => {
  it("extracts all five known fields from a Solo config", () => {
    const p = parseSessionConfig(SOLO);
    expect(p.profile).toBe("Solo");
    expect(p.budget).toBe("$1K");
    expect(p.timeline).toBe("3-6 months");
    expect(p.revenueThreshold).toBe("$50K/year");
    expect(p.founderSignal).toBe("8 years mech eng + 2 years blockchain BD");
    expect(p.raw).toBe(SOLO);
  });

  it("returns undefined fields for empty input", () => {
    const p = parseSessionConfig("");
    expect(p.profile).toBeUndefined();
    expect(p.budget).toBeUndefined();
    expect(p.raw).toBe("");
  });

  it("returns undefined fields for null/undefined input", () => {
    expect(parseSessionConfig(null).profile).toBeUndefined();
    expect(parseSessionConfig(undefined).profile).toBeUndefined();
  });

  it("tolerates whitespace around the colon", () => {
    const p = parseSessionConfig("Profile:   Solo\nBudget : $5K");
    expect(p.profile).toBe("Solo");
    expect(p.budget).toBe("$5K");
  });

  it("does not return Sectors as profile (field name mismatch)", () => {
    // Forge form doesn't emit Sectors but Prove does — make sure we never
    // confuse Sectors with Profile because both contain word characters.
    const cfg = "Sectors: AI Agents\nProfile: Solo";
    const p = parseSessionConfig(cfg);
    expect(p.profile).toBe("Solo");
  });
});

describe("summarizeSessionConfig", () => {
  it("joins available fields with middle-dot separator", () => {
    const s = summarizeSessionConfig(parseSessionConfig(SOLO));
    expect(s).toBe("Solo · $1K · 3-6 months · $50K/year");
  });

  it("returns empty string when no fields present", () => {
    expect(summarizeSessionConfig(parseSessionConfig(""))).toBe("");
  });

  it("handles partial configs gracefully", () => {
    const s = summarizeSessionConfig(parseSessionConfig("Profile: Solo\nBudget: $5K"));
    expect(s).toBe("Solo · $5K");
  });
});

describe("hasSessionConfig", () => {
  it("returns true when at least one field is set", () => {
    expect(hasSessionConfig(SOLO)).toBe(true);
    expect(hasSessionConfig("Profile: Solo")).toBe(true);
  });

  it("returns false for blank/null", () => {
    expect(hasSessionConfig("")).toBe(false);
    expect(hasSessionConfig(null)).toBe(false);
    expect(hasSessionConfig(undefined)).toBe(false);
  });

  it("returns false when only headers/whitespace are present", () => {
    expect(hasSessionConfig("# Session Config\n\n## Project Profile\n")).toBe(false);
  });
});

describe("serializeSessionConfig", () => {
  it("emits the same canonical markdown the human UI's buildSessionConfig() emits", () => {
    const md = serializeSessionConfig({
      profile: "Solo",
      budget: "$1K",
      timeline: "3-6 months",
      revenue_threshold: "$50K/year",
      founder_signal: "8 years payments infra, ex-Stripe.",
    });
    // Round-trips back through the parser cleanly:
    const parsed = parseSessionConfig(md);
    expect(parsed.profile).toBe("Solo");
    expect(parsed.budget).toBe("$1K");
    expect(parsed.timeline).toBe("3-6 months");
    expect(parsed.revenueThreshold).toBe("$50K/year");
    expect(parsed.founderSignal).toBe("8 years payments infra, ex-Stripe.");
    // Sanity-check the literal markdown shape the engine expects:
    expect(md).toMatch(/^# Session Config\n\n## Project Profile\n/);
  });

  it("returns empty string when no fields are set", () => {
    expect(serializeSessionConfig({})).toBe("");
    expect(serializeSessionConfig(null)).toBe("");
    expect(serializeSessionConfig(undefined)).toBe("");
  });

  it("omits the Project Profile block when only founder_signal is set", () => {
    const md = serializeSessionConfig({ founder_signal: "Solo dev." });
    expect(md).not.toContain("## Project Profile");
    expect(md).toContain("## Founder Signal");
    expect(md).toContain("Signal: Solo dev.");
  });

  it("omits the Founder Signal block when signal is empty/whitespace", () => {
    const md = serializeSessionConfig({ profile: "Solo", founder_signal: "   " });
    expect(md).not.toContain("## Founder Signal");
    expect(md).toContain("Profile: Solo");
  });

  it("supports partial config (only some fields set)", () => {
    const md = serializeSessionConfig({ profile: "Solo", budget: "$5K" });
    expect(md).toContain("Profile: Solo");
    expect(md).toContain("Budget: $5K");
    expect(md).not.toContain("Timeline:");
    expect(md).not.toContain("Revenue_threshold:");
  });
});

describe("SESSION_CONFIG enum constants", () => {
  it("export the canonical legal values for each enum field", () => {
    // These are the source-of-truth lists used by the agent API zod schema
    // and the OpenAPI spec. Locking them here so any future expansion is
    // intentional + tested.
    expect(SESSION_CONFIG_PROFILES).toEqual([
      "Solo", "Small Team (2-3)", "Small Team (4-5)", "Funded Team (6-15)", "Enterprise",
    ]);
    expect(SESSION_CONFIG_BUDGETS).toEqual(["$1K", "$5K", "$10K", "$25K", "$50K", "$100K+"]);
    expect(SESSION_CONFIG_TIMELINES).toEqual(["2 weeks", "4 weeks", "4-8 weeks", "8-12 weeks", "3-6 months"]);
    expect(SESSION_CONFIG_REVENUE_THRESHOLDS).toEqual([
      "$10K/year", "$50K/year", "$100K/year", "$500K/year", "$1M+/year",
    ]);
  });
});
