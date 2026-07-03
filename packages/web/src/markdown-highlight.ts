/**
 * 轻量 Markdown 源码语法高亮器。
 *
 * 仅用于编辑器左侧的着色叠加层:按行识别围栏代码块、标题、引用、列表、分隔线、
 * frontmatter 等块级结构,再对行内 inline code、粗体、斜体、链接、图片等做着色。
 * 输出已转义的 HTML 片段(由 <span class="md-..."> 包裹),可直接写入叠加层 <pre>。
 */

const TRIGGER_CHARS = new Set(["`", "*", "_", "~", "!", "["]);

/** 行内规则:均在 sticky 模式下从当前位置尝试匹配,按优先级取第一个命中。 */
const INLINE_RULES: Array<{ re: RegExp; cls: string }> = [
  { re: /`[^`\n]+`/y, cls: "md-code" },
  { re: /\*\*[^*\n]+?\*\*|__[^_\n]+?__/y, cls: "md-bold" },
  { re: /~~[^~\n]+?~~/y, cls: "md-strike" },
  { re: /!\[[^\]\n]*\]\([^)\n]*\)/y, cls: "md-image" },
  { re: /\[[^\]\n]*\]\([^)\n]*\)/y, cls: "md-link" },
  { re: /(?<![*\w])\*(?!\s)(?!\*)[^*\n]+?(?<!\s)\*(?![*\w])/y, cls: "md-italic" },
  { re: /(?<![\w])_(?!\s)[^_\n]+?(?<!\s)_(?![\w])/y, cls: "md-italic" }
];

/** 将 Markdown 源码转为带语法着色 span 的 HTML(已转义)。 */
export function highlightMarkdown(source: string): string {
  const lines = source.split("\n");
  const inFrontmatter = lines.length > 0 && lines[0].trim() === "---";
  let inFence = false;
  let fenceChar = "";
  let frontmatterOpen = inFrontmatter;
  const out: string[] = [];

  lines.forEach((line, index) => {
    if (inFence) {
      const close = line.match(/^\s*([`~])\1{2,}\s*$/);
      if (close && close[1] === fenceChar) {
        inFence = false;
        fenceChar = "";
        out.push(`<span class="md-fence">${escapeHtml(line)}</span>`);
      } else {
        out.push(`<span class="md-code-block">${escapeHtml(line)}</span>`);
      }
      return;
    }

    if (frontmatterOpen) {
      if (index > 0 && line.trim() === "---") {
        frontmatterOpen = false;
        out.push(`<span class="md-fence">${escapeHtml(line)}</span>`);
      } else {
        out.push(`<span class="md-frontmatter">${highlightFrontmatter(line)}</span>`);
      }
      return;
    }

    const fenceOpen = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fenceOpen) {
      inFence = true;
      fenceChar = fenceOpen[2][0];
      out.push(
        `<span class="md-fence">${escapeHtml(fenceOpen[1])}${escapeHtml(fenceOpen[2])}` +
        `<span class="md-lang">${escapeHtml(fenceOpen[3].trim())}</span></span>`
      );
      return;
    }

    const heading = line.match(/^(#{1,6})(\s+)(.*)$/);
    if (heading) {
      out.push(
        `<span class="md-heading"><span class="md-marker">${escapeHtml(heading[1])}</span>` +
        `${escapeHtml(heading[2])}${highlightInline(heading[3])}</span>`
      );
      return;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(`<span class="md-hr">${escapeHtml(line)}</span>`);
      return;
    }

    const quote = line.match(/^(\s{0,3}>\s?)(.*)$/);
    if (quote) {
      out.push(
        `<span class="md-quote"><span class="md-marker">${escapeHtml(quote[1])}</span>` +
        `${highlightInline(quote[2])}</span>`
      );
      return;
    }

    const list = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (list) {
      out.push(
        `<span class="md-list"><span class="md-marker">${escapeHtml(list[1])}${escapeHtml(list[2])}</span>` +
        ` ${highlightInline(list[3])}</span>`
      );
      return;
    }

    out.push(highlightInline(line));
  });

  return out.join("\n");
}

/** frontmatter 行:为 key: value 着色。 */
function highlightFrontmatter(line: string): string {
  const match = line.match(/^(\s*)([A-Za-z0-9_-]+)(\s*:\s*)(.*)$/);
  if (!match) {
    return escapeHtml(line);
  }
  return (
    `<span class="md-marker">${escapeHtml(match[1])}</span>` +
    `<span class="md-key">${escapeHtml(match[2])}</span>` +
    `${escapeHtml(match[3])}${highlightInline(match[4])}`
  );
}

/** 行内着色:扫描触发字符,逐段输出转义文本或匹配到的 token span。 */
function highlightInline(text: string): string {
  const length = text.length;
  let i = 0;
  let runStart = 0;
  let out = "";

  while (i < length) {
    if (!TRIGGER_CHARS.has(text[i])) {
      i += 1;
      continue;
    }

    if (i > runStart) {
      out += escapeHtml(text.slice(runStart, i));
    }

    let matched = false;
    for (const rule of INLINE_RULES) {
      rule.re.lastIndex = i;
      const match = rule.re.exec(text);
      if (match && match.index === i && match[0].length > 0) {
        out += `<span class="${rule.cls}">${escapeHtml(match[0])}</span>`;
        i += match[0].length;
        runStart = i;
        matched = true;
        break;
      }
    }

    if (!matched) {
      out += escapeHtml(text[i]);
      i += 1;
      runStart = i;
    }
  }

  if (runStart < length) {
    out += escapeHtml(text.slice(runStart));
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
