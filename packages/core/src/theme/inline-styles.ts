import juice from "juice";

/**
 * 将主题 CSS 内联到 HTML 元素上，便于平台粘贴和分发。
 */
export function inlineStyles(html: string, css: string): string {
  return juice.inlineContent(html, css, {
    removeStyleTags: true,
    preserveImportant: true
  });
}
