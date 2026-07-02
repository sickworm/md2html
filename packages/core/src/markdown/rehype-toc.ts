import { visit } from "unist-util-visit";

interface TocItem {
  depth: number;
  id: string;
  text: string;
}

interface RehypeTocOptions {
  enabled?: boolean;
}

export function rehypeToc(options: RehypeTocOptions = {}) {
  return (tree: any) => {
    if (!options.enabled || !Array.isArray(tree.children)) {
      return;
    }

    const items: TocItem[] = [];
    const usedIds = new Map<string, number>();

    visit(tree, "element", (node: any) => {
      if (!["h1", "h2", "h3"].includes(node.tagName)) {
        return;
      }

      const text = extractText(node).trim();
      if (!text) {
        return;
      }

      const depth = Number.parseInt(node.tagName.slice(1), 10);
      const id = uniqueId(String(node.properties?.id ?? slugify(text)), usedIds);
      node.properties = {
        ...(node.properties ?? {}),
        id
      };
      items.push({ depth, id, text });
    });

    if (items.length === 0) {
      return;
    }

    tree.children.unshift({
      type: "element",
      tagName: "nav",
      properties: { className: ["md2html-toc"] },
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { className: ["md2html-toc-title"] },
          children: [{ type: "text", value: "目录" }]
        },
        {
          type: "element",
          tagName: "ul",
          properties: {},
          children: items.map((item) => ({
            type: "element",
            tagName: "li",
            properties: { className: [`md2html-toc-level-${item.depth}`] },
            children: [
              {
                type: "element",
                tagName: "a",
                properties: { href: `#${item.id}` },
                children: [{ type: "text", value: item.text }]
              }
            ]
          }))
        }
      ]
    });
  };
}

function extractText(node: any): string {
  if (node.type === "text") {
    return String(node.value ?? "");
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children.map(extractText).join("");
}

function slugify(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, "-"));
}

function uniqueId(value: string, usedIds: Map<string, number>): string {
  const baseId = value.trim() || "section";
  const count = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, count + 1);
  return count === 0 ? baseId : `${baseId}-${count + 1}`;
}
