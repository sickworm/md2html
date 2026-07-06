import type { PlatformAdapter } from "./types.js";

export const kmAdapter: PlatformAdapter = {
  id: "km",
  capabilities: {
    supportsDetails: false,
    supportsStyleTag: false,
    requiresInlineStyle: true,
    allowsClassName: false,
    maxWidth: 770
  },
  adaptHtml(html) {
    return html;
  }
};
