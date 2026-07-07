import { visit } from "unist-util-visit";

/**
 * rehype 阶段：给所有 <a> 标签添加 target="_blank" rel="noopener noreferrer"，
 * 使预览中的链接在新标签页打开，不会在 iframe 内跳转。
 */
export function rehypeExternalLinks() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (node.tagName !== "a") return;
      if (!node.properties) node.properties = {};
      node.properties.target = "_blank";
      // 不覆盖已有的 rel（如图片角标的 "noopener noreferrer"）
      const existing = node.properties.rel;
      if (!existing) {
        node.properties.rel = "noopener noreferrer";
      }
    });
  };
}
