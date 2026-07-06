import type { ConversionWarning, PlatformId } from "../types.js";

export interface PlatformCapabilities {
  supportsDetails: boolean;
  supportsStyleTag: boolean;
  requiresInlineStyle: boolean;
  allowsClassName: boolean;
  /** .md2html-article 内容区最大宽度 (px) */
  maxWidth: number;
}

export interface PlatformAdapter {
  id: PlatformId;
  capabilities: PlatformCapabilities;
  adaptHtml(html: string, warnings: ConversionWarning[]): string;
}
