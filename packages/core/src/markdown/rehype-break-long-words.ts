import type { Root, Element, Text } from "hast";
import { visitParents } from "unist-util-visit-parents";

// 不注入断点的祖先标签:代码相关元素保持标识符完整,便于复制
const SKIP_ANCESTORS = new Set(["code", "pre", "kbd", "samp"]);

// 零宽空格:提供合法换行点但不占字符、不可见、复制粘贴时通常被忽略
const ZWSP = "​";

/**
 * 在「超长英文/代码 token」内部注入零宽空格,让浏览器可在词中换行。
 *
 * 解决 overflow-wrap:break-word 的固有局限:它只在「整个词一行都放不下」时才断,
 * 像 coreLibraryDesugaringEnabled 这种能挤进下一行的长词永远整体挪行、右侧留白。
 *
 * 策略:仅对长度 >= minWordLength 的连续非空白 token 处理,普通英文词(Compose 等)不动;
 * 断点优先选自然位置(camelCase 边界、_ . $ / - 之后),读起来不突兀。
 * 代码块/行内代码(见 SKIP_ANCESTORS)跳过,避免破坏可复制的标识符。
 */
export function rehypeBreakLongWords(options: { minWordLength?: number } = {}) {
  const minWordLength = options.minWordLength ?? 16;

  return (tree: Root) => {
    visitParents(tree, "text", (node: Text, ancestors: Array<Root | Element>) => {
      const inSkip = ancestors.some(
        (a) => a.type === "element" && SKIP_ANCESTORS.has((a as Element).tagName.toLowerCase())
      );
      if (inSkip) {
        return;
      }
      node.value = injectBreakpoints(node.value, minWordLength);
    });
  };
}

// 逐个空白分隔 token 处理:短词原样返回,长词在自然边界插入零宽空格
function injectBreakpoints(text: string, minWordLength: number): string {
  return text.replace(/\S+/g, (token) =>
    token.length >= minWordLength ? breakToken(token) : token
  );
}

// 在 camelCase 大小写边界、以及 _ . $ / - 等分隔符之后插入零宽空格
function breakToken(token: string): string {
  return token
    .replace(/([a-z0-9])([A-Z])/g, `$1${ZWSP}$2`)
    .replace(/([_.$/-])/g, `$1${ZWSP}`);
}
