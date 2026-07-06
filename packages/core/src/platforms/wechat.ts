import type { PlatformAdapter } from "./types.js";

export const wechatAdapter: PlatformAdapter = {
  id: "wechat",
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
