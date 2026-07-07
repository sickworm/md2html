import { visit } from "unist-util-visit";
import type { ImageLinkStyle } from "../theme/theme-loader.js";

// HAST 中 comment.value 不含 <!-- --> 包裹,直接匹配内容
const COMMENT_RE = /^\s*image-link:\s*(.+?)\s*(?:\|\s*(.+?)\s*)?\s*$/;

interface ImageLinkMeta {
  label: string;
  url?: string; // 可选:不提供 url 时只展示文字不跳转
}

/**
 * rehype 阶段:查找 HTML 注释中的图片角标链接指令,将后续图片包裹为角标链接结构。
 * 同时支持 Markdown ![]() 和原始 HTML <img> 两种图片写法。
 * 包裹方式由 imageLinkStyle 决定(pill/tab/card/accent)。
 */
export function rehypeImageLinks(imageLinkStyle?: ImageLinkStyle) {
  return (tree: any) => {
    if (!imageLinkStyle) {
      return;
    }
    processChildren(tree, imageLinkStyle);
  };
}

/** 递归处理节点及其子节点 */
function processChildren(node: any, style: ImageLinkStyle): void {
  if (!node.children || !Array.isArray(node.children)) {
    return;
  }

  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const meta = extractCommentMeta(child);
    if (!meta) {
      // 递归处理子节点
      processChildren(child, style);
      continue;
    }

    // 在后续兄弟中找 img
    const imgInfo = findNextImg(children, i + 1);
    if (!imgInfo) {
      // 没找到,移除孤立注释后递归处理
      removeComment(children, i);
      i--;
      continue;
    }

    // 包裹图片,替换到段落/img 原位置
    const wrapper = buildWrapper(imgInfo.node, meta, style);
    children.splice(imgInfo.parentIndex, 1, wrapper);
    // 重新计算:包裹插入的位置可能因为 imgInfo.parentIndex < i 而导致索引偏移
    // 这里 imgInfo.parentIndex 是找到的段落或 img 在原 children 中的位置
    // 如果 imgInfo.parentIndex < i,说明注释在图片后面(不正常),我们仍然移除原注释位置
    const commentIdx = imgInfo.parentIndex < i ? i : i;
    // 如果 img 和 comment 在同一个段落中(parentIndex === i),需要特殊处理
    if (imgInfo.parentIndex === i) {
      // comment 和 img 在同一个父节点内,img 已被包裹替换,现在移除 comment
      // 但 wrapper 替换了整个父节点,所以 comment 也被替换掉了,不需要额外移除
      // 实际上这种情况下 removeComment 之前就已经被替换了
      removeComment(children, commentIdx);
    } else {
      removeComment(children, commentIdx);
    }
    // 由于我们可能移除了 comment,重新调整索引
    if (imgInfo.parentIndex < i) {
      i -= 1; // 移除了 comment,当前索引回退
    } else {
      // img 在 comment 之后且 parentIndex > i,comment 已移除,无需调整
    }

    // 递归处理 wrapper(以防内部有嵌套的 image-link 注释)
    processChildren(wrapper, style);
  }
}

/** 从 comment 节点提取 image-link 元数据 */
function extractCommentMeta(node: any): ImageLinkMeta | null {
  if (node.type !== "comment") {
    return null;
  }
  const value = typeof node.value === "string" ? node.value.trim() : "";
  const match = value.match(COMMENT_RE);
  if (!match) {
    return null;
  }
  const label = match[1].trim();
  if (!label) {
    return null;
  }
  const url = match[2]?.trim() || undefined;
  return { label, url };
}

interface ImgFindResult {
  /** 实际的 img 节点 */
  node: any;
  /** img 所在父容器在 children 中的索引(如果 img 在段落内则是段落的索引) */
  parentIndex: number;
}

/** 在兄弟节点列表中向前查找最近的图片 */
function findNextImg(siblings: any[], start: number): ImgFindResult | null {
  for (let i = start; i < siblings.length; i++) {
    const node = siblings[i];

    // 直接的 img 元素(来自 HTML <img> 语法)
    if (node.type === "element" && node.tagName === "img") {
      return { node, parentIndex: i };
    }

    // 段落内只有一张图(来自 Markdown ![]() 语法)
    if (node.type === "element" && node.tagName === "p" && Array.isArray(node.children)) {
      let imgChild: any = null;
      let hasOtherContent = false;

      for (const c of node.children) {
        if (c.type === "element" && c.tagName === "img" && !imgChild) {
          imgChild = c;
        } else if (c.type === "comment") {
          // 跳过注释
        } else if (c.type === "text" && (c.value ?? "").trim() === "") {
          // 跳过空白文本
        } else {
          hasOtherContent = true;
        }
      }

      if (imgChild && !hasOtherContent) {
        return { node: imgChild, parentIndex: i };
      }

      if (hasOtherContent) {
        return null; // 段落有实质内容,停止搜索
      }
      // 空段落,继续
      continue;
    }

    // 遇到其他实质节点,停止搜索
    if (node.type === "text" && (node.value ?? "").trim() === "") {
      continue;
    }
    if (node.type === "comment") {
      continue;
    }
    // 其他非空白非注释节点:可能是另一个注释或内容,停止
    return null;
  }
  return null;
}

/** 移除注释节点(如果是段落内唯一内容则移除整个段落) */
function removeComment(siblings: any[], index: number): void {
  const node = siblings[index];
  if (!node) {
    return;
  }

  if (node.type === "comment") {
    siblings.splice(index, 1);
    return;
  }

  // 如果注释在段落内,检查段落是否只剩注释
  if (node.type === "element" && node.tagName === "p" && Array.isArray(node.children)) {
    const commentIdx = node.children.findIndex((c: any) => c.type === "comment");
    if (commentIdx < 0) {
      return;
    }
    const hasOtherContent = node.children.some((c: any, idx: number) => {
      if (idx === commentIdx) return false;
      if (c.type === "text" && (c.value ?? "").trim() === "") return false;
      return true;
    });
    if (!hasOtherContent) {
      siblings.splice(index, 1);
      return;
    }
    node.children.splice(commentIdx, 1);
  }
}

function buildWrapper(
  imgNode: any,
  meta: ImageLinkMeta,
  style: ImageLinkStyle
): any {
  const labelNode = meta.url
    ? buildLinkNode(meta.url, meta.label)
    : buildSpanNode(meta.label);

  const wrapperClass = style === "card" ? "md2html-img-link-card-w" : "md2html-img-link-w";
  const labelClass = `md2html-img-link-${style}`;

  labelNode.properties.className = [labelClass];

  return {
    type: "element",
    tagName: "span",
    properties: { className: [wrapperClass] },
    children: [labelNode, imgNode]
  };
}

function buildLinkNode(url: string, label: string): any {
  return {
    type: "element",
    tagName: "a",
    properties: {
      href: url,
      target: "_blank",
      rel: "noopener noreferrer"
    },
    children: [{ type: "text", value: label }]
  };
}

function buildSpanNode(label: string): any {
  return {
    type: "element",
    tagName: "span",
    properties: {},
    children: [{ type: "text", value: label }]
  };
}
