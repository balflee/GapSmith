import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const navBarSource = fs.readFileSync(
  path.resolve(__dirname, "../nav-bar.tsx"),
  "utf-8"
);

describe("NavBar includes Pricing link", () => {
  it("contains a link to /pricing", () => {
    expect(navBarSource).toContain('href="/pricing"');
  });

  it("displays Pricing text", () => {
    expect(navBarSource).toContain("Pricing");
  });
});
