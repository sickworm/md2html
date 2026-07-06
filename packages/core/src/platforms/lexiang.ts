import type { PlatformAdapter } from "./types.js";

export const lexiangAdapter: PlatformAdapter = {
  id: "lexiang",
  capabilities: {
    supportsDetails: false,
    supportsStyleTag: false,
    requiresInlineStyle: true,
    allowsClassName: false,
    maxWidth: 825
  },
  adaptHtml(html) {
    return html;
  }
};
