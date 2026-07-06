import type { PlatformAdapter } from "./types.js";

export const genericAdapter: PlatformAdapter = {
  id: "generic",
  capabilities: {
    supportsDetails: true,
    supportsStyleTag: true,
    requiresInlineStyle: false,
    allowsClassName: true,
    maxWidth: 770
  },
  adaptHtml(html) {
    return html;
  }
};
