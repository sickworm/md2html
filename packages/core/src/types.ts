export type PlatformId = "generic" | "wechat" | "km" | "lexiang";

export interface ConvertOptions {
  inputFile: string;
  outputDir: string;
  platform?: PlatformId;
  theme?: string;
  assetsConfig?: string;
  toc?: boolean;
  strict?: boolean;
}

export interface ArticleAssets {
  images: Record<string, ArticleAssetImage>;
}

export interface ArticleAssetImage {
  source: string;
  width?: number;
}

export interface ImageManifestItem {
  id: string;
  source: string;
  outputRelativePath: string;
  outputFile: string;
  alt?: string;
  originalWidth?: number;
  originalHeight?: number;
  displayWidth: number;
  missing: boolean;
  remote: boolean;
}

export type WarningCode =
  | "missing-image"
  | "unsupported-html"
  | "unknown-callout"
  | "details-downgraded"
  | "image-dimensions-unavailable"
  | "remote-image-skipped";

export interface ConversionWarning {
  code: WarningCode;
  message: string;
  source?: string;
}

export interface ConversionReport {
  inputFile: string;
  platform: PlatformId;
  theme: string;
  imagesCopied: number;
  imagesMissing: number;
  warnings: ConversionWarning[];
}

export interface ConvertResult {
  html: string;
  inlineHtml: string;
  assets: ArticleAssets;
  imageManifest: ImageManifestItem[];
  report: ConversionReport;
  outputFiles: {
    html: string;
    inlineHtml: string;
    assets: string;
    report: string;
    resDir: string;
  };
}
