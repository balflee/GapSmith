import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const landingSource = fs.readFileSync(
  path.resolve(__dirname, "../landing-client.tsx"),
  "utf-8"
);

describe("Landing page pricing section replaced with CTA", () => {
  it("does not contain PRICING_SKUS constant", () => {
    expect(landingSource).not.toContain("PRICING_SKUS");
  });

  it("does not contain handleSolPayment function", () => {
    expect(landingSource).not.toContain("handleSolPayment");
  });

  it("does not import BorderBeam", () => {
    expect(landingSource).not.toContain("BorderBeam");
  });

  it("does not import trackX402PayStart", () => {
    expect(landingSource).not.toContain("trackX402PayStart");
  });

  it("contains a link to /pricing", () => {
    expect(landingSource).toContain('href="/pricing"');
  });

  it("contains the pricing CTA section comment", () => {
    expect(landingSource).toContain("PRICING CTA");
  });

  it("does not contain the old PRICING SECTION comment", () => {
    expect(landingSource).not.toContain("PRICING SECTION");
  });
});
