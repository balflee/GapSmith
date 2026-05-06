/**
 * One-time script: generate the 7 hero assets for /lab/debate-room
 * (6 persona portraits + 1 verdict banner) via fal.ai's GPT-Image-2.
 *
 * Run:
 *   node --env-file=.env.local scripts/gen-lab-avatars.mjs
 *
 * Outputs to public/lab/avatars/<persona>.png — ~1024×1024 each.
 * Cost: ~$0.04 × 7 = $0.30. Run takes ~3-5 min total (fal queues each
 * generation, ~30-60s per image).
 *
 * Once committed, the Next.js Image component will optimize + serve as
 * webp at request time, so we don't bother converting locally.
 *
 * NEVER commit FAL_KEY. It lives in .env.local (gitignored).
 */

import { writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  console.error("FAL_KEY missing. Run with: node --env-file=.env.local scripts/gen-lab-avatars.mjs");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "lab", "avatars");

// Shared base style — abstract AI agent character, NOT a human portrait.
// Web3-friendly: clean geometric forms with subtle neon glow, single
// shape per persona, distinct silhouette so 6 cards lined up read
// instantly as 6 different "agents". No human features (no faces, no
// hands, no skin) — these are AI personas, the visual should feel that way.
const BASE_STYLE =
  "Abstract AI agent character, single geometric form centered, smooth " +
  "vector curves and clean lines, soft inner neon glow in the persona's " +
  "color, warm cream off-white background with subtle grain, no human " +
  "features — no faces, no eyes, no hands, no skin, no clothing, no text " +
  "or letters anywhere. Modern web3 / AI-native aesthetic, dignified but " +
  "warm, premium editorial illustration suitable for a venture analysis " +
  "platform. Square 1:1 composition with the form filling 60-70 percent " +
  "of the frame.";

const PERSONA_PROMPTS = {
  proposer:
    "An ascending geometric form built from upward-pointing triangles or " +
    "stacked open hexagons, suggesting forward momentum and optimism. Soft " +
    "warm-blue inner glow (#5b8def). The form leans subtly to the right " +
    "as if mid-stride. Clean negative space around the silhouette.",
  challenger:
    "An angular geometric form with sharp shard-like protrusions or a " +
    "single asymmetric crack running through, suggesting a probing " +
    "skeptical force. Warm red-orange inner glow (#d4513c). One bold " +
    "diagonal accent line cutting across the form.",
  analyst:
    "A precise geometric form composed of fine concentric or grid-like " +
    "internal patterns, evoking data structure and rigor. Cool violet " +
    "inner glow (#7e6dd4). Subtle visualization-graph echoes inside the " +
    "shape, but kept abstract — no actual numbers or charts.",
  defender:
    "A balanced shield-like geometric form, roughly heraldic but stripped " +
    "down to pure geometry. Soft sage-green inner glow (#5fa67d). " +
    "Symmetric vertical axis. A single clean horizontal band suggesting " +
    "stability and protection.",
  reviewer:
    "A geometric form built around a single perfect ring or magnifying-" +
    "glass-like circle, with a thin tail or bracket extending downward. " +
    "Neutral cool-grey inner glow (#88909a). Suggests focused examination. " +
    "One small accent dot at the center of the ring.",
  strategist:
    "A geometric form crowned with a single subtle apex or chess-piece " +
    "silhouette, evoking long-range vision. Warm gold inner glow (#d4a13c). " +
    "Vertical orientation with a slightly raised top, conveying a panel-" +
    "above-the-board perspective.",
};

const VERDICT_BANNER_PROMPT =
  "Abstract scales of justice expressed as pure geometry — two suspended " +
  "geometric forms at slightly different heights connected by a fine " +
  "horizontal beam, balanced on a clean vertical pillar. Soft multi-color " +
  "gradient mixing warm gold and cool teal. Cream off-white background. " +
  "Hero-image proportions (16:9 landscape). Modern web3 aesthetic. No " +
  "text, no human figures, no literal scale-pans — keep everything " +
  "abstract and geometric. Clean negative space, magazine-cover composition.";

// fal.ai queue API — submit, poll, fetch result image URL.
// Docs: https://docs.fal.ai/openai/gpt-image-2/quickstart
// Model path is `<owner>/<model>` — for OpenAI models the owner is `openai`,
// NOT `fal-ai`. Initial 404 ("Application 'openai' not found") came from
// putting `fal-ai/` in front by analogy with fal's own models.
const FAL_BASE = "https://queue.fal.run/openai/gpt-image-2";

/** Submit a generation request, return request_id + status_url. */
async function submitGeneration(prompt, sizeHint = "square_hd") {
  // image_size is an ENUM string on this endpoint, NOT pixel dimensions.
  // Valid: square_hd | square | portrait_4_3 | portrait_16_9 |
  //        landscape_4_3 | landscape_16_9
  const res = await fetch(FAL_BASE, {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: `${BASE_STYLE}. ${prompt}`,
      image_size: sizeHint,
      num_images: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submit failed ${res.status}: ${text}`);
  }
  return res.json();
}

/** Poll status_url until completed. Returns the response_url for the result.
 *  Loose cap: 200 iterations × 3s = 10 min. fal queue regularly takes 3-5
 *  min per gpt-image-2 generation when traffic is high. */
async function pollUntilDone(statusUrl, label) {
  const start = Date.now();
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));  // 3s between polls
    const res = await fetch(statusUrl, {
      headers: { "Authorization": `Key ${FAL_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`poll ${label} failed ${res.status}: ${text}`);
    }
    const body = await res.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(`\r  ${label}: ${body.status} (${elapsed}s)   `);
    if (body.status === "COMPLETED") {
      console.log();
      return body.response_url;
    }
    if (body.status === "FAILED" || body.status === "CANCELLED") {
      throw new Error(`generation ${label} ended with status ${body.status}`);
    }
  }
  throw new Error(`generation ${label} timed out after 10 minutes`);
}

/** Fetch the final response, return the first image's URL. */
async function fetchResultImageUrl(responseUrl, label) {
  const res = await fetch(responseUrl, {
    headers: { "Authorization": `Key ${FAL_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`result ${label} failed ${res.status}: ${text}`);
  }
  const body = await res.json();
  const img = body.images?.[0];
  if (!img?.url) throw new Error(`no image url in result for ${label}: ${JSON.stringify(body).slice(0, 200)}`);
  return img.url;
}

/** Download URL → bytes → write to OUT_DIR/<filename>. Caller passes the
 * full filename including extension (e.g. "proposer-v2.png"). */
async function downloadTo(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${filename} failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(OUT_DIR, filename);
  await writeFile(path, buf);
  return { path, bytes: buf.length };
}

async function fileExists(path) {
  try { await access(path, fsConstants.F_OK); return true; }
  catch { return false; }
}

async function generateOne(name, prompt, sizeHint) {
  // Filename suffix `-v2` avoids any cache-key collision with the
  // initial portrait-style generation. If you ever change the visual
  // direction again, bump this suffix in lockstep with AVATAR_FOR in
  // src/app/lab/debate-room/debate-room-client.tsx.
  const filename = `${name}-v2.png`;
  // Resume-friendly: skip if file already exists. Useful when an earlier
  // run died mid-way (network blip, process kill) — re-run the same
  // command and only the missing assets get generated.
  const existingPath = join(OUT_DIR, filename);
  if (await fileExists(existingPath)) {
    console.log(`\n[${name}] already exists at ${existingPath} — skipping.`);
    return;
  }
  console.log(`\n[${name}] submitting...`);
  const submitted = await submitGeneration(prompt, sizeHint);
  // submitted shape: { status, request_id, response_url, status_url, queue_position, ... }
  if (!submitted.status_url || !submitted.response_url) {
    throw new Error(`unexpected submit shape for ${name}: ${JSON.stringify(submitted).slice(0, 200)}`);
  }
  await pollUntilDone(submitted.status_url, name);
  const imgUrl = await fetchResultImageUrl(submitted.response_url, name);
  const { path, bytes } = await downloadTo(imgUrl, filename);
  console.log(`  [OK] ${filename} (${(bytes / 1024).toFixed(0)} KB) → ${path}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Personas first (square_hd = highest-quality square), then verdict
  // banner (landscape 16:9).
  for (const [name, prompt] of Object.entries(PERSONA_PROMPTS)) {
    await generateOne(name, prompt, "square_hd");
  }
  await generateOne("verdict-banner", VERDICT_BANNER_PROMPT, "landscape_16_9");

  console.log("\nAll 7 assets generated. Output dir:", OUT_DIR);
  console.log("Next.js Image component will optimize to webp at request time.");
}

main().catch((e) => {
  console.error("\n[FAIL]", e.message);
  process.exit(1);
});
