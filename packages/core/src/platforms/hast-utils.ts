import type { Element } from "hast";

export function hasClassName(node: Element, name: string): boolean {
  const className = node.properties?.className;
  if (Array.isArray(className)) {
    return className.includes(name);
  }
  return typeof className === "string" && className.split(/\s+/).includes(name);
}

export function appendInlineStyle(node: Element, declarations: string): void {
  const properties = node.properties ?? {};
  const current = typeof properties.style === "string" ? properties.style.trim() : "";
  node.properties = {
    ...properties,
    style: current ? `${current.replace(/;?$/, ";")}${declarations}` : declarations
  };
}

export function replaceInlineStyle(node: Element, declarations: string): void {
  node.properties = {
    ...(node.properties ?? {}),
    style: declarations
  };
}

export function findFirstElement(node: Element, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of node.children) {
    if (child.type !== "element") {
      continue;
    }
    if (predicate(child)) {
      return child;
    }
    const nested = findFirstElement(child, predicate);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

export function readPositiveWidth(node: Element): number | undefined {
  const width = Number.parseInt(String(node.properties?.width ?? ""), 10);
  return Number.isFinite(width) && width > 0 ? width : undefined;
}
