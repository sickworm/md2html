import type { ConversionWarning, PlatformId } from "../types.js";
import type { Root } from "hast";

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
  /** 在 HTML 序列化前按平台调整结构，规避平台编辑器的样式清理与 DOM 重写。 */
  adaptTree?(tree: Root): void;
  adaptHtml(html: string, warnings: ConversionWarning[]): string;
}
