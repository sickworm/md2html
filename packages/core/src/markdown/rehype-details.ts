import { visit } from "unist-util-visit";
import type { ConversionWarning } from "../types.js";

export function rehypeDetails(options: { supportsDetails: boolean; warnings: ConversionWarning[] }) {
  return (tree: unknown) => {
    if (options.supportsDetails) {
      return;
    }

    visit(tree as never, "element", (node: any) => {
      if (node.tagName !== "details") {
        return;
      }

      const summary = node.children?.find((child: any) => child.type === "element" && child.tagName === "summary");
      const content = (node.children ?? []).filter((child: any) => child !== summary);

      node.tagName = "section";
      node.properties = {
        className: ["md2html-details-fallback"]
      };
      node.children = [
        {
          type: "element",
          tagName: "div",
          properties: { className: ["md2html-details-summary"] },
          children: summary?.children ?? [{ type: "text", value: "Details" }]
        },
        {
          type: "element",
          tagName: "div",
          properties: { className: ["md2html-details-content"] },
          children: content
        }
      ];

      options.warnings.push({
        code: "details-downgraded",
        message: "details block downgraded for selected platform"
      });
    });
  };
}
