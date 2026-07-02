import { visit } from "unist-util-visit";
import type { ConversionWarning } from "../types.js";

const variants = new Set(["NOTE", "TIP", "WARNING", "IMPORTANT"]);
const CALLOUT_MARKER_RE = /^\[!(\w+)\](?:[ \t]*\r?\n[ \t]*|[ \t]+|$)/;

export function remarkCallouts(warnings: ConversionWarning[] = []) {
  return (tree: unknown) => {
    visit(tree as never, "blockquote", (node: any) => {
      const first = node.children?.[0];
      if (first?.type !== "paragraph" || !Array.isArray(first.children) || first.children.length === 0) {
        return;
      }

      const firstTextNode = first.children[0];
      const firstText = firstTextNode?.type === "text" ? firstTextNode.value : undefined;
      const match = typeof firstText === "string" ? firstText.match(CALLOUT_MARKER_RE) : null;
      if (!match) {
        return;
      }

      const variant = match[1].toUpperCase();
      if (!variants.has(variant)) {
        warnings.push({
          code: "unknown-callout",
          message: `Unknown callout type: ${variant}`
        });
        return;
      }

      const remainingText = firstText.slice(match[0].length);
      if (remainingText) {
        firstTextNode.value = remainingText;
      } else {
        first.children.shift();
        if (first.children.length === 0) {
          node.children.shift();
        }
      }

      node.data = {
        ...(node.data ?? {}),
        hName: "section",
        hProperties: {
          className: ["md2html-callout", `md2html-callout-${variant.toLowerCase()}`],
          "data-callout": variant.toLowerCase()
        }
      };
    });
  };
}
