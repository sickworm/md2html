import type { PlatformAdapter } from "./types.js";
import { visit } from "unist-util-visit";
import type { Element } from "hast";
import { appendInlineStyle, hasClassName } from "./hast-utils.js";

export const kmAdapter: PlatformAdapter = {
  id: "km",
  capabilities: {
    supportsDetails: false,
    supportsStyleTag: false,
    requiresInlineStyle: true,
    allowsClassName: false,
    maxWidth: 770
  },
  adaptTree(tree) {
    visit(tree, "element", (node: Element) => {
      if (!hasClassName(node, "md2html-callout-badge")) {
        return;
      }

      // KM 会移除 absolute 与 inline-flex。改用普通块布局和行高居中，
      // 负边距保持圆徽悬挂位置；即使负边距再被清理，圆徽仍能正常成圆。
      appendInlineStyle(
        node,
        "position:static;display:block;width:28px;height:28px;line-height:28px;text-align:center;box-sizing:border-box;margin:-31px 0 3px -2px;"
      );
    });
  },
  adaptHtml(html) {
    return html;
  }
};
