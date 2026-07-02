import fs from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import type {
  ArticleAssets,
  ConversionReport,
  ConvertOptions,
  ConvertResult,
  ConversionWarning,
  ImageManifestItem,
  PlatformId
} from "./types.js";
import { loadArticleAssets, resolveAssetsConfigPath } from "./assets/assets-config.js";
import { createImageManifest, type ImageRef } from "./assets/image-manifest.js";
import { rehypeDetails } from "./markdown/rehype-details.js";
import {
  rehypeApplyImageManifest,
  rehypeNormalizeImages
} from "./markdown/rehype-normalize-images.js";
import { rehypeSanitizePlatformHtml } from "./markdown/rehype-sanitize-platform-html.js";
import { rehypeToc } from "./markdown/rehype-toc.js";
import { remarkCallouts } from "./markdown/remark-callouts.js";
import { writeOutput } from "./output/write-output.js";
import { getPlatformAdapter } from "./platforms/index.js";
import { inlineStyles } from "./theme/inline-styles.js";
import { loadTheme } from "./theme/theme-loader.js";

export async function convertMarkdown(options: ConvertOptions): Promise<ConvertResult> {
  const platform: PlatformId = options.platform ?? "generic";
  const adapter = getPlatformAdapter(platform);
  const warnings: ConversionWarning[] = [];
  const markdown = await fs.readFile(options.inputFile, "utf8");
  const assetsConfig = await resolveAssetsConfigPath(options.inputFile, options.assetsConfig);
  const assets = await loadArticleAssets(assetsConfig);
  const theme = await loadTheme(options.theme);
  const firstPassRefs: ImageRef[] = [];
  const collectionWarnings: ConversionWarning[] = [];
  await renderMarkdownToHtml(markdown, {
    imageRefs: firstPassRefs,
    warnings: collectionWarnings,
    supportsDetails: true,
    toc: false,
    imageManifest: undefined
  });

  const imageManifest = await createImageManifest({
    inputFile: options.inputFile,
    imageRefs: firstPassRefs,
    assets,
    outputDir: options.outputDir,
    imageMaxWidth: theme.config.imageMaxWidth,
    warnings
  });

  if (options.strict && imageManifest.some((image) => image.missing)) {
    throw new Error("Strict mode failed: one or more local images are missing");
  }

  const finalImageRefs: ImageRef[] = [];
  const bodyHtml = await renderMarkdownToHtml(markdown, {
    imageRefs: finalImageRefs,
    warnings,
    supportsDetails: adapter.capabilities.supportsDetails,
    toc: Boolean(options.toc),
    imageManifest
  });
  const adaptedBodyHtml = adapter.adaptHtml(bodyHtml, warnings);
  if (options.strict && warnings.some((warning) => warning.code === "unsupported-html")) {
    throw new Error("Strict mode failed: unsafe or unsupported HTML was removed");
  }
  const resolvedAssets: ArticleAssets = {
    images: Object.fromEntries(
      imageManifest
        .filter((image) => !image.remote)
        .map((image) => [
          image.id,
          {
            source: image.source,
            width: image.displayWidth
          }
        ])
    )
  };
  const report: ConversionReport = {
    inputFile: options.inputFile,
    platform,
    theme: theme.name,
    imagesCopied: imageManifest.filter((image) => !image.remote && !image.missing).length,
    imagesMissing: imageManifest.filter((image) => image.missing).length,
    warnings
  };
  const articleHtml = `<article class="md2html-article">\n${adaptedBodyHtml}\n</article>`;
  const previewHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(path.basename(options.inputFile))}</title>
<style>${theme.css}</style>
</head>
<body>
${articleHtml}
</body>
</html>`;
  const inlinedHtml = inlineStyles(articleHtml, theme.css);
  const outputFiles = await writeOutput({
    inputFile: options.inputFile,
    outputDir: options.outputDir,
    html: previewHtml,
    inlineHtml: inlinedHtml,
    assets: resolvedAssets,
    imageManifest,
    report
  });

  return {
    html: previewHtml,
    inlineHtml: inlinedHtml,
    assets: resolvedAssets,
    imageManifest,
    report,
    outputFiles
  };
}

async function renderMarkdownToHtml(
  markdown: string,
  context: {
    imageRefs: ImageRef[];
    warnings: ConversionWarning[];
    supportsDetails: boolean;
    toc: boolean;
    imageManifest?: ImageManifestItem[];
  }
): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCallouts, context.warnings)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitizePlatformHtml, context.warnings)
    .use(rehypeNormalizeImages, context.imageRefs);

  if (context.imageManifest) {
    processor.use(rehypeApplyImageManifest, context.imageManifest);
  }

  const file = await processor
    .use(rehypeDetails, {
      supportsDetails: context.supportsDetails,
      warnings: context.warnings
    })
    .use(rehypeToc, { enabled: context.toc })
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
