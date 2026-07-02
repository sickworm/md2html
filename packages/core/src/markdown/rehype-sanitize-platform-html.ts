import type { ConversionWarning } from "../types.js";

const BLOCKED_TAGS = new Set([
  "base",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "textarea"
]);

const ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "details",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul"
]);

const GLOBAL_ATTRIBUTES = new Set(["className", "dir", "id", "lang", "title"]);

const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "rel", "target"]),
  details: new Set(["open"]),
  img: new Set(["alt", "height", "src", "width"]),
  input: new Set(["checked", "disabled", "type"]),
  ol: new Set(["start"]),
  td: new Set(["align", "colSpan", "rowSpan"]),
  th: new Set(["align", "colSpan", "rowSpan"])
};

interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/**
 * 对 Markdown 中的原始 HTML 做平台级安全收敛。
 * 这里采用最小 allowlist：移除危险标签、剥离事件属性，并把不支持的标签降级为纯内容。
 */
export function rehypeSanitizePlatformHtml(warnings: ConversionWarning[]) {
  const emittedWarnings = new Set<string>();

  return (tree: HastNode) => {
    sanitizeChildren(tree, warnings, emittedWarnings);
  };
}

function sanitizeChildren(
  parent: HastNode,
  warnings: ConversionWarning[],
  emittedWarnings: Set<string>
): void {
  if (!Array.isArray(parent.children)) {
    return;
  }

  const nextChildren: HastNode[] = [];

  for (const child of parent.children) {
    const sanitized = sanitizeNode(child, warnings, emittedWarnings);
    if (!sanitized) {
      continue;
    }

    if (Array.isArray(sanitized)) {
      nextChildren.push(...sanitized);
      continue;
    }

    nextChildren.push(sanitized);
  }

  parent.children = nextChildren;
}

function sanitizeNode(
  node: HastNode,
  warnings: ConversionWarning[],
  emittedWarnings: Set<string>
): HastNode | HastNode[] | null {
  if (node.type !== "element") {
    return node;
  }

  const tagName = String(node.tagName ?? "").toLowerCase();
  node.tagName = tagName;

  if (BLOCKED_TAGS.has(tagName)) {
    pushUnsupportedHtmlWarning(
      warnings,
      emittedWarnings,
      `Unsafe HTML removed: <${tagName}>`,
      `<${tagName}>`
    );
    return null;
  }

  sanitizeChildren(node, warnings, emittedWarnings);

  if (!ALLOWED_TAGS.has(tagName)) {
    pushUnsupportedHtmlWarning(
      warnings,
      emittedWarnings,
      `Unsupported HTML downgraded: <${tagName}>`,
      `<${tagName}>`
    );
    return node.children ?? [];
  }

  node.properties = sanitizeProperties(tagName, node.properties, warnings, emittedWarnings);

  if (tagName === "input" && !isSafeCheckboxInput(node.properties)) {
    pushUnsupportedHtmlWarning(
      warnings,
      emittedWarnings,
      "Unsupported HTML downgraded: <input>",
      "<input>"
    );
    return null;
  }

  if (tagName === "a") {
    const href = readStringProperty(node.properties, "href");
    if (href && isUnsafeHref(href)) {
      delete node.properties.href;
      pushUnsupportedHtmlWarning(
        warnings,
        emittedWarnings,
        "Unsafe HTML attribute removed: href on <a>",
        `<a href="${href}">`
      );
    }

    if (node.properties.target === "_blank" && !node.properties.rel) {
      node.properties.rel = "noopener noreferrer";
    }
  }

  if (tagName === "img") {
    const src = readStringProperty(node.properties, "src");
    if (src && isUnsafeSrc(src)) {
      delete node.properties.src;
      pushUnsupportedHtmlWarning(
        warnings,
        emittedWarnings,
        "Unsafe HTML attribute removed: src on <img>",
        `<img src="${src}">`
      );
    }
  }

  return node;
}

function sanitizeProperties(
  tagName: string,
  properties: Record<string, unknown> | undefined,
  warnings: ConversionWarning[],
  emittedWarnings: Set<string>
): Record<string, unknown> {
  const nextProperties: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(properties ?? {})) {
    if (isEventHandlerAttribute(name)) {
      pushUnsupportedHtmlWarning(
        warnings,
        emittedWarnings,
        `Unsafe HTML attribute removed: ${name} on <${tagName}>`,
        `<${tagName} ${name}>`
      );
      continue;
    }

    if (!isAllowedAttribute(tagName, name)) {
      pushUnsupportedHtmlWarning(
        warnings,
        emittedWarnings,
        `Unsupported HTML attribute removed: ${name} on <${tagName}>`,
        `<${tagName} ${name}>`
      );
      continue;
    }

    nextProperties[name] = value;
  }

  return nextProperties;
}

function isAllowedAttribute(tagName: string, name: string): boolean {
  return isDataAttribute(name) || GLOBAL_ATTRIBUTES.has(name) || TAG_ATTRIBUTES[tagName]?.has(name) === true;
}

function isDataAttribute(name: string): boolean {
  return /^data(?:[A-Z-]|$)/.test(name);
}

function isEventHandlerAttribute(name: string): boolean {
  return /^on/i.test(name);
}

function isSafeCheckboxInput(properties: Record<string, unknown>): boolean {
  const type = readStringProperty(properties, "type");
  return type === "checkbox";
}

function isUnsafeHref(value: string): boolean {
  return /^(?:javascript|vbscript|data):/i.test(value.trim());
}

function isUnsafeSrc(value: string): boolean {
  return /^(?:javascript|vbscript):/i.test(value.trim());
}

function readStringProperty(properties: Record<string, unknown>, name: string): string | undefined {
  const value = properties[name];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  return undefined;
}

function pushUnsupportedHtmlWarning(
  warnings: ConversionWarning[],
  emittedWarnings: Set<string>,
  message: string,
  source: string
): void {
  const key = `${message}\u0000${source}`;
  if (emittedWarnings.has(key)) {
    return;
  }

  emittedWarnings.add(key);
  warnings.push({
    code: "unsupported-html",
    message,
    source
  });
}
