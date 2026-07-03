// 常见语言的展示名,找不到时回退到大写原名
const LANG_LABELS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  jsx: "JSX",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  json: "JSON",
  kotlin: "Kotlin",
  kt: "Kotlin",
  java: "Java",
  python: "Python",
  py: "Python",
  go: "Go",
  rust: "Rust",
  rs: "Rust",
  c: "C",
  cpp: "C++",
  css: "CSS",
  html: "HTML",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  sql: "SQL",
  swift: "Swift",
  md: "Markdown",
  text: "Text",
  txt: "Text"
};

/**
 * Shiki transformer:把高亮后的 <pre> 就地改造成带顶栏的容器。
 * 顶栏含三个 mac 风格圆点(内联 style,公众号可见)和语言标签(真实文本)。
 * 必须在 transformer 的 pre 钩子内完成 —— Shiki 会替换 pre 节点,
 * 外部独立 rehype 插件拿不到最终节点。
 */
export function createCodeBlockChromeTransformer() {
  return {
    pre(this: any, node: any) {
      const lang = String(this.options?.lang ?? "").toLowerCase();
      const label = LANG_LABELS[lang] ?? (lang ? lang.toUpperCase() : "CODE");

      // 保留原 pre 作为容器的子节点
      const pre = {
        type: "element",
        tagName: "pre",
        properties: { ...node.properties },
        children: node.children
      };

      node.tagName = "section";
      node.properties = { className: ["md2html-code-block"] };
      node.children = [buildHeader(label), pre];
    }
  };
}

function buildHeader(label: string): any {
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["md2html-code-header"] },
    children: [
      dot("#ff5f56"),
      dot("#ffbd2e"),
      dot("#27c93f"),
      {
        type: "element",
        tagName: "span",
        properties: { className: ["md2html-code-lang"] },
        children: [{ type: "text", value: label }]
      }
    ]
  };
}

function dot(color: string): any {
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: ["md2html-code-dot"],
      style: `background:${color};`
    },
    children: []
  };
}
