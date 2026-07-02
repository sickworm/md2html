import fs from "node:fs/promises";
import path from "node:path";
import fse from "fs-extra";
import type {
  ArticleAssets,
  ConversionReport,
  ConvertResult,
  ImageManifestItem
} from "../types.js";

export interface WriteOutputOptions {
  inputFile: string;
  outputDir: string;
  html: string;
  inlineHtml: string;
  assets: ArticleAssets;
  imageManifest: ImageManifestItem[];
  report: ConversionReport;
}

/**
 * 写出 HTML、内联 HTML、资源清单和转换报告，并复制本地图片资源。
 */
export async function writeOutput(
  options: WriteOutputOptions
): Promise<ConvertResult["outputFiles"]> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const baseName = path.basename(options.inputFile, path.extname(options.inputFile));
  const htmlFile = path.join(options.outputDir, `${baseName}.html`);
  const inlineHtmlFile = path.join(options.outputDir, `${baseName}.inline.html`);
  const assetsFile = path.join(options.outputDir, `${baseName}.assets.json`);
  const reportFile = path.join(options.outputDir, "report.json");
  const resDir = path.join(options.outputDir, "res");

  assertManagedResDirDoesNotContainSources({
    inputFile: options.inputFile,
    imageManifest: options.imageManifest,
    resDir
  });
  await fs.rm(resDir, { recursive: true, force: true });
  await fs.mkdir(resDir, { recursive: true });

  for (const image of options.imageManifest) {
    if (image.remote || image.missing) {
      continue;
    }

    const sourceFile = path.resolve(path.dirname(options.inputFile), image.source);
    await fse.copy(sourceFile, image.outputFile);
  }

  await fs.writeFile(htmlFile, options.html, "utf8");
  await fs.writeFile(inlineHtmlFile, options.inlineHtml, "utf8");
  await fs.writeFile(assetsFile, JSON.stringify(options.assets, null, 2), "utf8");
  await fs.writeFile(reportFile, JSON.stringify(options.report, null, 2), "utf8");

  return {
    html: htmlFile,
    inlineHtml: inlineHtmlFile,
    assets: assetsFile,
    report: reportFile,
    resDir
  };
}

/**
 * 防止输出目录的受管 res 目录与源图片目录重叠，避免清理输出时删除源文件。
 */
function assertManagedResDirDoesNotContainSources(input: {
  inputFile: string;
  imageManifest: ImageManifestItem[];
  resDir: string;
}): void {
  const offendingSources = input.imageManifest
    .filter((image) => !image.remote && !image.missing)
    .map((image) => path.resolve(path.dirname(input.inputFile), image.source))
    .filter((sourceFile) => isPathInsideDirectory(sourceFile, input.resDir));

  if (offendingSources.length === 0) {
    return;
  }

  const sourceList = [...new Set(offendingSources)].sort().join(", ");
  throw new Error(`Refusing to clean output res directory because it contains source images: ${sourceList}`);
}

function isPathInsideDirectory(targetPath: string, directoryPath: string): boolean {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(targetPath));
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
