import type { ConversionWarning, PlatformId } from "../types.js";

export interface PlatformCapabilities {
  supportsDetails: boolean;
  supportsStyleTag: boolean;
  requiresInlineStyle: boolean;
  allowsClassName: boolean;
}

export interface PlatformAdapter {
  id: PlatformId;
  capabilities: PlatformCapabilities;
  adaptHtml(html: string, warnings: ConversionWarning[]): string;
}
