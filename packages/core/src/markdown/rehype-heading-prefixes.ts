import { visit } from "unist-util-visit";
import type { HeadingPrefixConfig } from "../theme/theme-loader.js";

type HeadingTagName = keyof HeadingPrefixConfig;
const headingTagNames = new Set<string>(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Injects real prefix text into heading nodes so preview and inline HTML export
 * keep the same visual hierarchy on platforms that drop CSS pseudo-elements.
 */
export function rehypeHeadingPrefixes(prefixes?: HeadingPrefixConfig) {
  return (tree: any) => {
    if (!prefixes) {
      return;
    }

    visit(tree, "element", (node: any) => {
      const tagName = String(node.tagName ?? "").toLowerCase();
      if (!headingTagNames.has(tagName)) {
        return;
      }

      const prefix = prefixes[tagName as HeadingTagName];
      if (!prefix || !Array.isArray(node.children)) {
        return;
      }

      node.children.unshift({
        type: "element",
        tagName: "span",
        properties: {
          className: ["md2html-heading-prefix"],
          "aria-hidden": "true"
        },
        children: [{ type: "text", value: prefix }]
      });
    });
  };
}
