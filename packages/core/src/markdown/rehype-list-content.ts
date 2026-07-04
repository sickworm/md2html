import { visit } from "unist-util-visit";

const listTagNames = new Set(["ul", "ol"]);
const contentClassName = "md2html-li-content";

/**
 * Wraps list item content so marker styling can be separated from body text
 * after CSS is inlined for publishing platforms.
 */
export function rehypeListContent() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (String(node.tagName ?? "").toLowerCase() !== "li" || !Array.isArray(node.children)) {
        return;
      }

      const nextChildren: any[] = [];
      let pending: any[] = [];

      const flushPending = () => {
        if (pending.length === 0) {
          return;
        }

        if (!pending.some(hasVisibleContent)) {
          nextChildren.push(...pending);
          pending = [];
          return;
        }

        nextChildren.push({
          type: "element",
          tagName: "span",
          properties: { className: [contentClassName] },
          children: pending
        });
        pending = [];
      };

      for (const child of node.children) {
        if (isListElement(child)) {
          flushPending();
          nextChildren.push(child);
          continue;
        }

        if (isParagraphElement(child)) {
          flushPending();
          child.properties = child.properties ?? {};
          child.properties.className = appendClass(child.properties.className, contentClassName);
          nextChildren.push(child);
          continue;
        }

        pending.push(child);
      }

      flushPending();
      node.children = nextChildren;
    });
  };
}

function isListElement(node: any): boolean {
  return node?.type === "element" && listTagNames.has(String(node.tagName ?? "").toLowerCase());
}

function isParagraphElement(node: any): boolean {
  return node?.type === "element" && String(node.tagName ?? "").toLowerCase() === "p";
}

function hasVisibleContent(node: any): boolean {
  return node?.type !== "text" || String(node.value ?? "").trim().length > 0;
}

function appendClass(value: unknown, className: string): string[] {
  if (Array.isArray(value)) {
    return value.includes(className) ? value : [...value, className];
  }
  if (typeof value === "string" && value.trim()) {
    const values = value.split(/\s+/);
    return values.includes(className) ? values : [...values, className];
  }
  return [className];
}
