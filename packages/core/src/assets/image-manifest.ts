import path from "node:path";
import fs from "node:fs/promises";
import type { ArticleAssets, ConversionWarning, ImageManifestItem } from "../types.js";
import { readImageDimensions } from "./image-dimensions.js";

export interface ImageRef {
  source: string;
  alt?: string;
  width?: number;
}

export interface CreateImageManifestOptions {
  inputFile: string;
  imageRefs: ImageRef[];
  assets: ArticleAssets;
  outputDir: string;
  imageMaxWidth: number;
  warnings: ConversionWarning[];
}

// Build the ordered image manifest used by later conversion steps.
export async function createImageManifest(options: CreateImageManifestOptions): Promise<ImageManifestItem[]> {
  const inputDir = path.dirname(options.inputFile);
  const resDir = path.join(options.outputDir, "res");
  const manifest: ImageManifestItem[] = [];
  let localIndex = 0;

  for (const ref of options.imageRefs) {
    if (!isLocalRelativeSource(ref.source)) {
      options.warnings.push({
        code: "remote-image-skipped",
        message: `Non-local image is kept as-is: ${ref.source}`,
        source: ref.source
      });
      manifest.push({
        id: "",
        source: ref.source,
        outputRelativePath: ref.source,
        outputFile: ref.source,
        alt: ref.alt,
        displayWidth: ref.width ?? options.imageMaxWidth,
        missing: false,
        remote: true
      });
      continue;
    }

    localIndex += 1;
    const id = String(localIndex).padStart(3, "0");
    const sourceFile = path.resolve(inputDir, ref.source);
    const ext = path.extname(ref.source) || ".png";
    const outputRelativePath = `res/${id}${ext}`;
    const outputFile = path.join(resDir, `${id}${ext}`);
    // 按源文件名查找配置(图片尺寸绑定到文件名而非出现顺序)
    const configured = options.assets.images[ref.source];
    let missing = false;

    try {
      await fs.access(sourceFile);
    } catch {
      missing = true;
      options.warnings.push({
        code: "missing-image",
        message: `Local image is missing: ${ref.source}`,
        source: ref.source
      });
    }

    const dimensions = missing ? {} : await readImageDimensions(sourceFile);
    if (!missing && !dimensions.width) {
      options.warnings.push({
        code: "image-dimensions-unavailable",
        message: `Image dimensions unavailable: ${ref.source}`,
        source: ref.source
      });
    }

    const displayWidth = resolveDisplayWidth({
      configuredWidth: configured?.width,
      sourceWidth: ref.width,
      originalWidth: dimensions.width,
      imageMaxWidth: options.imageMaxWidth
    });

    manifest.push({
      id,
      source: ref.source,
      outputRelativePath,
      outputFile,
      alt: ref.alt,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      displayWidth,
      missing,
      remote: false
    });
  }

  return manifest;
}

function resolveDisplayWidth(input: {
  configuredWidth?: number;
  sourceWidth?: number;
  originalWidth?: number;
  imageMaxWidth: number;
}): number {
  if (input.configuredWidth && input.configuredWidth > 0) {
    return input.configuredWidth;
  }

  if (input.sourceWidth && input.sourceWidth > 0) {
    return input.sourceWidth;
  }

  if (input.originalWidth && input.originalWidth > 0) {
    return Math.min(input.originalWidth, input.imageMaxWidth);
  }

  return input.imageMaxWidth;
}

function isLocalRelativeSource(source: string): boolean {
  if (!source) {
    return false;
  }

  if (source.startsWith("//")) {
    return false;
  }

  if (source.startsWith("/") || source.startsWith("\\")) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
    return false;
  }

  if (/^[a-zA-Z]:[\\/]/.test(source)) {
    return false;
  }

  return !path.isAbsolute(source);
}
