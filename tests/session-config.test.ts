import { describe, it, expect } from "vitest";
import {
  parseSessionConfig,
  summarizeSessionConfig,
  hasSessionConfig,
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
