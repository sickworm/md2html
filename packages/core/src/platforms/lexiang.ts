import type { PlatformAdapter } from "./types.js";
import type { Element, Root } from "hast";
import {
  appendInlineStyle,
  findFirstElement,
  hasClassName,
  readPositiveWidth,
  replaceInlineStyle
} from "./hast-utils.js";

export const lexiangAdapter: PlatformAdapter = {
  id: "lexiang",
  capabilities: {
    supportsDetails: false,
    supportsStyleTag: false,
    requiresInlineStyle: true,
    allowsClassName: false,
    maxWidth: 825
  },
  adaptTree(tree) {
    centerImageLinkWrappers(tree);
  },
  adaptHtml(html) {
    return html;
  }
};

type ParentNode = Root | Element;

/** 用明确宽度的 inline-block 卡片规避乐乎把 display:table 图片容器扩成 100%。 */
function centerImageLinkWrappers(parent: ParentNode): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child.type !== "element") {
      continue;
    }

    if (isImageLinkWrapper(child)) {
      const image = findFirstElement(child, (element) => element.tagName === "img");
      const width = image ? readPositiveWidth(image) : undefined;
      if (!image || !width) {
        continue;
      }

      appendInlineStyle(
        child,
        `display:inline-block;width:${width}px;max-width:100%;box-sizing:border-box;text-align:left;vertical-align:top;margin:0;`
      );
      replaceInlineStyle(image, "display:block;width:100%;max-width:100%;height:auto;margin:0;");

      const centerWrapper: Element = {
        type: "element",
        tagName: "span",
        properties: {
          className: ["md2html-lexiang-image-center"],
          style: "display:block;text-align:center;line-height:0;margin:24px 0;"
        },
        children: [child]
      };
      parent.children[index] = centerWrapper;
      continue;
    }

    centerImageLinkWrappers(child);
  }
}

function isImageLinkWrapper(node: Element): boolean {
  return hasClassName(node, "md2html-img-link-w") || hasClassName(node, "md2html-img-link-card-w");
}
