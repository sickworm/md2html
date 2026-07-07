import path from "node:path";
import fs from "node:fs/promises";
import type { ArticleAssets } from "../types.js";

export interface ResolvedAssetsConfig {
  path?: string;
  explicit: boolean;
}

// Resolve the article asset config path and load a minimal images-only config.
export async function resolveAssetsConfigPath(
  inputFile: string,
  explicitPath?: string
): Promise<ResolvedAssetsConfig> {
  if (explicitPath) {
    try {
      await fs.access(explicitPath);
      return {
        path: explicitPath,
        explicit: true
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Assets config not found: ${explicitPath}`);
      }
      throw error;
    }
  }

  const inputDir = path.dirname(inputFile);
  const inputBase = path.basename(inputFile, path.extname(inputFile));
  const defaultPath = path.join(inputDir, `${inputBase}.assets.json`);

  try {
    await fs.access(defaultPath);
    return {
      path: defaultPath,
      explicit: false
    };
  } catch {
    return {
      path: undefined,
      explicit: false
    };
  }
}

export async function loadArticleAssets(config?: string | ResolvedAssetsConfig): Promise<ArticleAssets> {
  const resolved = normalizeResolvedConfig(config);
  if (!resolved.path) {
    return { images: {} };
  }

  try {
    const raw = await fs.readFile(resolved.path, "utf8");
    const parsed = JSON.parse(raw);
    validateArticleAssetsConfig(parsed);
    return parsed as ArticleAssets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !resolved.explicit) {
      return { images: {} };
    }
    throw new Error(`Invalid article assets config: ${resolved.path}. ${(error as Error).message}`);
  }
}

function normalizeResolvedConfig(config?: string | ResolvedAssetsConfig): ResolvedAssetsConfig {
  if (!config) {
    return {
      path: undefined,
      explicit: false
    };
  }

  if (typeof config === "string") {
    return {
      path: config,
      explicit: false
    };
  }

  return config;
}

function validateArticleAssetsConfig(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected top-level object with images map");
  }

  const images = (value as { images?: unknown }).images;
  if (!images || typeof images !== "object" || Array.isArray(images)) {
    throw new Error("Expected top-level images object");
  }

  for (const [id, entry] of Object.entries(images as Record<string, unknown>)) {
    validateArticleAssetImageEntry(entry, id);
  }

  const urlReplacements = (value as { urlReplacements?: unknown }).urlReplacements;
  if (urlReplacements !== undefined) {
    validateUrlReplacements(urlReplacements);
  }

  const imageReplacements = (value as { imageReplacements?: unknown }).imageReplacements;
  if (imageReplacements !== undefined) {
    validateImageReplacements(imageReplacements);
  }
}

function validateUrlReplacements(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("urlReplacements must be an object of platform->map entries");
  }

  for (const [platform, map] of Object.entries(value as Record<string, unknown>)) {
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new Error(`urlReplacements.${platform} must be an object of from->to string pairs`);
    }
    for (const [from, to] of Object.entries(map as Record<string, unknown>)) {
      if (typeof from !== "string" || typeof to !== "string") {
        throw new Error(`urlReplacements.${platform} entry "${String(from)}: ${String(to)}" must have string keys and values`);
      }
    }
  }
}

function validateImageReplacements(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("imageReplacements must be an object of platform->map entries");
  }

  for (const [platform, map] of Object.entries(value as Record<string, unknown>)) {
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new Error(`imageReplacements.${platform} must be an object of from->to string pairs`);
    }
    for (const [from, to] of Object.entries(map as Record<string, unknown>)) {
      if (typeof from !== "string" || typeof to !== "string") {
        throw new Error(`imageReplacements.${platform} entry "${String(from)}: ${String(to)}" must have string keys and values`);
      }
    }
  }
}

function validateArticleAssetImageEntry(entry: unknown, id: string): void {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`images.${id} must be an object`);
  }

  const image = entry as { source?: unknown; width?: unknown };
  if (image.source !== undefined && typeof image.source !== "string") {
    throw new Error(`images.${id}.source must be a string`);
  }
  if (image.width !== undefined && !isPositiveFiniteNumber(image.width)) {
    throw new Error(`images.${id}.width must be a positive finite number`);
  }
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
