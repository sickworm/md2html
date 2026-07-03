import { visit } from "unist-util-visit";
import type { ImageRef } from "../assets/image-manifest.js";
import type { ImageManifestItem } from "../types.js";

export function rehypeNormalizeImages(imageRefs: ImageRef[]) {
  return (tree: unknown) => {
    visit(tree as never, "element", (node: any, _index, parent: any) => {
      if (node.tagName !== "img") {
        return;
      }

      const src = String(node.properties?.src ?? "");
      const props: Record<string, unknown> = { ...(node.properties ?? {}) };

      if (src) {
        const ref: ImageRef = {
          source: src,
          alt: typeof node.properties?.alt === "string" ? node.properties.alt : undefined,
          width: parsePositiveInt(node.properties?.width)
        };
        imageRefs.push(ref);
        props["data-md2html-image-index"] = String(imageRefs.length - 1);
      }

      // 与文字写在同一行的图片标记为内联,避免被 display:block 强制换行
      if (parent && isInlineImage(node, parent)) {
        props.className = mergeClass(props.className, "md2html-inline-image");
      }

      node.properties = props;
    });
  };
}

/**
 * 判断图片是否"与文字写在同一行"。
 * 规则:图片起止行附近存在同行的非空白文本或行内元素兄弟时,视为内联。
 * 单独成段(无兄弟)或虽在多行段落但独占一行的图片,仍按块级处理。
 */
function isInlineImage(img: any, parent: any): boolean {
  const imgLine = img.position?.start?.line;
  if (!Number.isFinite(imgLine)) {
    return false;
  }

  const siblings = Array.isArray(parent.children) ? parent.children : [];
  const idx = siblings.indexOf(img);
  if (idx < 0) {
    return false;
  }

  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];

  if (prev && hasInlineContentOnLine(prev, imgLine, "tail")) {
    return true;
  }
  if (next && hasInlineContentOnLine(next, imgLine, "head")) {
    return true;
  }
  return false;
}

/**
 * 判断兄弟节点在指定行上是否有非空白的行内内容。
 * side="tail" 用于前一个兄弟(取该行末尾内容),side="head" 用于后一个兄弟(取该行开头内容)。
 */
function hasInlineContentOnLine(node: any, line: number, side: "tail" | "head"): boolean {
  if (!node) {
    return false;
  }

  if (node.type === "text") {
    const value = typeof node.value === "string" ? node.value : "";
    if (!value) {
      return false;
    }
    if (side === "tail") {
      if (node.position?.end?.line !== line) {
        return false;
      }
      const trailing = value.slice(value.lastIndexOf("\n") + 1);
      return trailing.trim().length > 0;
    }
    if (node.position?.start?.line !== line) {
      return false;
    }
    const nl = value.indexOf("\n");
    const leading = nl === -1 ? value : value.slice(0, nl);
    return leading.trim().length > 0;
  }

  if (node.type === "element") {
    // 段落内的元素兄弟都是行内元素,只要与图片同行即视为内联
    if (side === "tail") {
      return node.position?.end?.line === line;
    }
    return node.position?.start?.line === line;
  }

  return false;
}

function mergeClass(existing: unknown, name: string): string[] {
  const arr = Array.isArray(existing)
    ? existing.filter((c) => typeof c === "string" && c.length > 0)
    : typeof existing === "string"
      ? existing.split(/\s+/).filter(Boolean)
      : [];
  return arr.includes(name) ? arr : [...arr, name];
}

export function rehypeApplyImageManifest(imageManifest: ImageManifestItem[]) {
  return (tree: unknown) => {
    visit(tree as never, "element", (node: any) => {
      if (node.tagName !== "img") {
        return;
      }

      const index = Number.parseInt(String(node.properties?.["data-md2html-image-index"] ?? ""), 10);
      if (!Number.isFinite(index)) {
        return;
      }

      const image = imageManifest[index];
      if (!image) {
        return;
      }

      const isInline = Array.isArray(node.properties?.className)
        && node.properties.className.includes("md2html-inline-image");

      // displayWidth 已由 manifest 解析(优先使用用户写的 width,其次原图尺寸,受 imageMaxWidth 约束)
      const style = isInline
        ? `max-width:100%;height:auto;vertical-align:middle;width:${image.displayWidth}px;`
        : `max-width:100%;height:auto;width:${image.displayWidth}px;`;

      const props: Record<string, unknown> = {
        ...node.properties,
        src: image.outputRelativePath,
        width: String(image.displayWidth),
        alt: image.alt ?? "",
        style
      };

      delete props["data-md2html-image-index"];
      node.properties = props;
    });
  };
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
