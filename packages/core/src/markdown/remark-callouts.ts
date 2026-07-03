import { visit } from "unist-util-visit";
import type { ConversionWarning } from "../types.js";
import type { CalloutConfig } from "../theme/theme-loader.js";

const variants = new Set(["NOTE", "TIP", "WARNING", "IMPORTANT"]);
const CALLOUT_MARKER_RE = /^\[!(\w+)\](?:[ \t]*\r?\n[ \t]*|[ \t]+|$)/;

// 四种 callout 的中文标签,注入到首行,替代原生全大写英文标记
const CALLOUT_LABELS: Record<string, string> = {
  note: "说明",
  tip: "建议",
  warning: "注意",
  important: "重点"
};

export function remarkCallouts(warnings: ConversionWarning[] = [], callout?: CalloutConfig) {
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

      // 数据指标卡:> [!METRICS] 后每行 "数值 | 标签",降级环境即普通引用块
      if (variant === "METRICS") {
        applyMetrics(node, first, match[0]);
        return;
      }

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

      const lower = variant.toLowerCase();
      const style = callout?.types[lower];
      if (style) {
        // 新样式:注入悬挂圆徽(仅图标字符),中文标签放到 title 上;不再内联标签文字
        injectBadge(node, style.icon, style.label);
      } else {
        // 旧样式:把中文标签内联到首行开头(其他主题保持不变)
        injectLabel(node, CALLOUT_LABELS[lower]);
      }

      node.data = {
        ...(node.data ?? {}),
        hName: "section",
        hProperties: {
          className: ["md2html-callout", `md2html-callout-${lower}`],
          "data-callout": lower
        }
      };
    });
  };
}

/**
 * 把中文标签作为加粗节点注入到 callout 首段开头,使其内联在正文首行。
 * 若首块不是段落(内容被完全移除等情况),则新建一个段落承载标签。
 */
function injectLabel(node: any, label: string): void {
  const labelNode = {
    type: "strong",
    data: { hProperties: { className: ["md2html-callout-label"] } },
    children: [{ type: "text", value: label }]
  };
  const separator = { type: "text", value: " " };

  const firstBlock = node.children?.[0];
  if (firstBlock?.type === "paragraph" && Array.isArray(firstBlock.children)) {
    firstBlock.children.unshift(labelNode, separator);
    return;
  }

  node.children.unshift({ type: "paragraph", children: [labelNode] });
}

/**
 * 注入一枚悬挂圆徽:图标字符包在 span 里,中文标签放到 title(sanitizer 允许 title)。
 * 圆徽作为 callout 的首个子节点,配合生成的 CSS 绝对定位到卡片左上外沿。
 */
function injectBadge(node: any, icon: string, label: string): void {
  const badgeNode = {
    type: "emphasis",
    data: {
      hName: "span",
      hProperties: { className: ["md2html-callout-badge"], title: label }
    },
    children: [{ type: "text", value: icon }]
  };

  node.children.unshift(badgeNode);
}

/**
 * 把 METRICS 引用块渲染成数据指标卡:一行多列,每列大数字 + 标签。
 * 用 hChildren 直接指定 hast table 结构(table 布局兼容不支持 flex 的公众号)。
 */
function applyMetrics(node: any, paragraph: any, marker: string): void {
  const full = collectParagraphText(paragraph);
  const rows = full
    .slice(marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf("|");
      return sep === -1
        ? { num: line, label: "" }
        : { num: line.slice(0, sep).trim(), label: line.slice(sep + 1).trim() };
    });

  if (rows.length === 0) {
    return;
  }

  const cells = rows.map((row) => ({
    type: "element",
    tagName: "td",
    properties: { className: ["md2html-metric"] },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["md2html-metric-num"] },
        children: [{ type: "text", value: row.num }]
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["md2html-metric-label"] },
        children: [{ type: "text", value: row.label }]
      }
    ]
  }));

  node.data = {
    ...(node.data ?? {}),
    hName: "table",
    hProperties: { className: ["md2html-metrics"] },
    hChildren: [
      {
        type: "element",
        tagName: "tbody",
        children: [{ type: "element", tagName: "tr", children: cells }]
      }
    ]
  };
}

// 拼接段落内的纯文本,软换行(text 中的 \n)和硬换行(break)都还原为换行
function collectParagraphText(paragraph: any): string {
  return (paragraph.children ?? [])
    .map((child: any) => {
      if (child.type === "text") {
        return String(child.value ?? "");
      }
      if (child.type === "break") {
        return "\n";
      }
      return "";
    })
    .join("");
}
