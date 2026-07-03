import type { Root, Element } from "hast";
import { visit } from "unist-util-visit";

/** 块级元素标签：这些元素通常对应 Markdown 中的一个或多个连续源码行 */
const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p",
  "li",
  "blockquote",
  "pre",
  "hr",
  "table",
  "section",
  "details",
  "div",
  "ol",
  "ul",
  "dl", "dt", "dd",
  "figure", "figcaption",
]);

/**
 * 将 mdast position 信息注入到 hast 块级元素的 data-source-line 属性。
 * 用于前端实现编辑器与预览的联动滚动。
 *
 * 注意：remark-rehype 会将 mdast 节点的 position 复制到生成的 hast 节点上，
 * 因此 block 级元素可通过 node.position.start.line 获取对应的源码起始行号。
 */
export function rehypeSourceLine() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const tag = node.tagName?.toLowerCase() ?? "";
      if (!BLOCK_TAGS.has(tag)) {
        return;
      }

      const position = (node as Element & { position?: { start: { line: number; column: number }; end: { line: number; column: number } } }).position;
      if (!position) {
        return;
      }

      node.properties ??= {};
      node.properties.dataSourceLine = String(position.start.line);
      node.properties.dataSourceLineEnd = String(position.end.line);
    });
  };
}
