import { fal } from "@fal-ai/client";
import { writeFile, mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 2000;
const PUBLIC_IMAGES_DIR = join(process.cwd(), "public", "images");

const FALLBACK_MODEL = "fal-ai/flux-2-pro";

// --- Model Configuration ---

export type ImageType = "hero" | "feature" | "logo" | "og" | "mockup" | "empty-state";

interface ModelConfig {
  modelId: string;
  defaultParams: Record<string, unknown>;
  outputFormat: "jpeg" | "png" | "webp" | "svg";
}

const MODEL_CONFIGS: Record<ImageType, ModelConfig> = {
  hero: {
    modelId: "fal-ai/flux-2-pro",
    defaultParams: { output_format: "jpeg", safety_tolerance: "2" },
    outputFormat: "jpeg",
  },
  feature: {
    modelId: "fal-ai/recraft/v4/pro/text-to-image",
    defaultParams: {},
    outputFormat: "webp",
  },
  logo: {
    modelId: "fal-ai/recraft/v4/pro/text-to-vector",
    defaultParams: {},
    outputFormat: "svg",
  },
  og: {
    modelId: "fal-ai/ideogram/v3",
    defaultParams: { style: "DESIGN", expand_prompt: false, rendering_speed: "QUALITY" },
    outputFormat: "png",
  },
  mockup: {
    modelId: "fal-ai/gpt-image-1.5",
    defaultParams: { quality: "high", background: "opaque", output_format: "png" },
    outputFormat: "png",
  },
  "empty-state": {
    modelId: "fal-ai/recraft/v4/pro/text-to-image",
    defaultParams: {},
    outputFormat: "webp",
  },
};

// --- Types ---

export interface GenerateImageOptions {
  type: ImageType;
  prompt: string;
  width: number;
  height: number;
  filename: string;
  altText: string;
  colors?: Array<{ r: number; g: number; b: number }>; // For Recraft models
  outputDir?: string; // Override output directory (default: public/images)
}

export interface ImageResult {
  path: string;
  publicPath: string;
  altText: string;
  fallback: boolean;
  model: string;
}

// --- Internal ---

function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.FAL_KEY) return false;
  // Check persistent key file
  try {
    const keyPath = join(homedir(), '.fal', 'key');
    const key = readFileSync(keyPath, 'utf-8').trim();
    if (key && !key.startsWith('placeholder')) {
      process.env.FAL_KEY = key;
      return false;
    }
  } catch { /* ~/.fal/key not readable */ }
  return true;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir: string = PUBLIC_IMAGES_DIR): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function callModel(
  modelId: string,
  input: Record<string, unknown>
): Promise<string> {
  const result = await fal.subscribe(modelId, { input });
  const data = result.data as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error(`No image URL from ${modelId}`);
  return url;
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
}

// --- Public API ---

/**
 * Generate an image using the optimal model for the image type.
 * Falls back to FLUX.2 Pro if the specialized model fails,
 * then to SVG placeholder if all API calls fail.
 */
export async function generateImage(
  options: GenerateImageOptions
): Promise<ImageResult> {
  const { type, prompt, width, height, filename, altText, colors, outputDir } = options;
  const config = MODEL_CONFIGS[type];
  const targetDir = outputDir ?? PUBLIC_IMAGES_DIR;
  const filePath = join(targetDir, filename);
  const publicPath = outputDir ? `${outputDir}/${filename}` : `/images/${filename}`;

  await ensureDir(targetDir);

  if (isDemoMode()) {
    return generateSvgPlaceholder({ width, height, filename, altText });
  }

  // Build model-specific input
  const input: Record<string, unknown> = {
    prompt,
    ...config.defaultParams,
  };

  // Size handling differs per model
  if (config.modelId === "fal-ai/gpt-image-1.5") {
    input.image_size = `${width}x${height}`;
  } else {
    input.image_size = { width, height };
  }

  // Recraft color support
  if (colors && config.modelId.includes("recraft")) {
    input.colors = colors;
  }

  // Try specialized model, then fallback to FLUX, then SVG
  const modelsToTry = config.modelId === FALLBACK_MODEL
    ? [config.modelId]
    : [config.modelId, FALLBACK_MODEL];

  for (const modelId of modelsToTry) {
    const modelInput = modelId === FALLBACK_MODEL && modelId !== config.modelId
      ? { prompt, image_size: { width, height }, output_format: "jpeg", safety_tolerance: "2" }
      : input;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const imageUrl = await callModel(modelId, modelInput);
        await downloadToFile(imageUrl, filePath);
        return { path: filePath, publicPath, altText, fallback: false, model: modelId };
      } catch {
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        } else if (modelId !== FALLBACK_MODEL) {
          console.warn(`${modelId} failed for ${filename}, trying fallback...`);
          break; // Move to fallback model
        }
      }
    }
  }

  console.warn(`All models failed for ${filename}, using SVG placeholder`);
  return generateSvgPlaceholder({ width, height, filename, altText });
}

/**
 * Generate a themed SVG placeholder at the same file path.
 */
export async function generateSvgPlaceholder(options: {
  width: number;
  height: number;
  filename: string;
  altText: string;
}): Promise<ImageResult> {
  const { width, height, filename, altText } = options;
  const svgFilename = filename.replace(/\.\w+$/, ".svg");
  const filePath = join(PUBLIC_IMAGES_DIR, svgFilename);
  const publicPath = `/images/${svgFilename}`;

  await ensureDir();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl(var(--primary, 220 70% 50%));stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:hsl(var(--primary, 220 70% 50%));stop-opacity:0.05"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${width * 0.3}" cy="${height * 0.4}" r="${Math.min(width, height) * 0.15}" fill="hsl(var(--primary, 220 70% 50%))" opacity="0.1"/>
  <circle cx="${width * 0.7}" cy="${height * 0.6}" r="${Math.min(width, height) * 0.2}" fill="hsl(var(--primary, 220 70% 50%))" opacity="0.08"/>
</svg>`;

  await writeFile(filePath, svg, "utf-8");
  return { path: filePath, publicPath, altText, fallback: true, model: "svg-placeholder" };
}
