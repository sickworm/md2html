import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCalloutCss } from "./callout-css.js";

// 单个 callout 类型的可配置视觉:标签、图标字符、卡片底色、圆徽底色、图标色
export interface CalloutTypeStyle {
  label: string;
  icon: string;
  background: string;
  badge: string;
  iconColor?: string;
}

// theme.json 中的 callout 声明:圆角 + 各类型样式(note/tip/warning/important)
export interface CalloutConfig {
  radius?: number;
  types: Record<string, CalloutTypeStyle>;
}

export interface ThemeConfig {
  contentMaxWidth: number;
  fontFamily: string;
  imageMaxWidth: number;
  codeLineWrap: boolean;
  /**
   * 正文长英文/代码词的换行策略,覆盖 theme.css 中的默认值:
   * - "break-word"(默认):只断「一行放不下」的超长词,不碰普通英文词;
   * - "break-all":任意字符处都可断,填满每行、右边界最齐,但普通词也会被截断;
   * - "normal":不强制断词,长词整体挪到下一行(右侧可能留大片空白)。
   */
  longWordBreak?: "break-word" | "break-all" | "normal";
  /**
   * break-word 策略下,触发「零宽空格补断点」的最小 token 长度(默认 16)。
   * 仅超过此长度的连续英文/代码 token 才在词中插入断点,普通英文词不受影响。
   */
  longWordMinLength?: number;
  callout?: CalloutConfig;
}

export interface LoadedTheme {
  name: string;
  directory: string;
  css: string;
  config: ThemeConfig;
}

const defaultConfig: ThemeConfig = {
  contentMaxWidth: 700,
  fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  imageMaxWidth: 700,
  codeLineWrap: true
};

/**
 * 加载主题目录中的 CSS 和配置，并补齐默认配置值。
 */
export async function loadTheme(theme = "jugg-clean-v4"): Promise<LoadedTheme> {
  const directory = theme.includes("/") || theme.includes("\\")
    ? path.resolve(theme)
    : await resolveNamedThemeDirectory(theme);
  const name = path.basename(directory);
  const css = await fs.readFile(path.join(directory, "theme.css"), "utf8");
  const config = await readThemeConfig(path.join(directory, "theme.json"));
  const mergedConfig: ThemeConfig = {
    ...defaultConfig,
    ...config
  };

  // callout 配置存在时,从 theme.json 生成 callout CSS 并追加,交由 juice 内联
  let finalCss = mergedConfig.callout ? css + generateCalloutCss(mergedConfig.callout) : css;

  // longWordBreak 配置存在时,追加一段覆盖正文换行策略(同选择器后置覆盖 theme.css 默认值)
  if (mergedConfig.longWordBreak) {
    finalCss += generateLongWordBreakCss(mergedConfig.longWordBreak);
  }

  return {
    name,
    directory,
    css: finalCss,
    config: mergedConfig
  };
}

/**
 * 根据换行策略生成一小段覆盖 CSS,交由 juice 内联到 .md2html-article。
 * 注意 word-break 的合法值只有 normal/break-all/keep-all,「只断超长词」要靠 overflow-wrap。
 * break-all 时同时给代码块 pre 恢复 normal,避免代码长标识符被从中间硬断。
 */
function generateLongWordBreakCss(strategy: NonNullable<ThemeConfig["longWordBreak"]>): string {
  // 各策略映射到合法的 (word-break, overflow-wrap) 组合
  const map = {
    "break-word": { wordBreak: "normal", overflowWrap: "break-word" }, // 只断一行放不下的超长词
    "break-all": { wordBreak: "break-all", overflowWrap: "break-word" }, // 任意字符可断,右边界最齐
    normal: { wordBreak: "normal", overflowWrap: "normal" } // 不强制断词
  } as const;
  const { wordBreak, overflowWrap } = map[strategy];
  const base = `.md2html-article{word-break:${wordBreak};overflow-wrap:${overflowWrap};}`;
  const preGuard = strategy === "break-all"
    ? ".md2html-code-block pre,.md2html-article pre{word-break:normal;}"
    : "";
  return base + preGuard;
}

async function resolveNamedThemeDirectory(theme: string): Promise<string> {
  const packageThemesDir = path.resolve(
    fileURLToPath(new URL("../../../../themes", import.meta.url)),
    theme
  );

  try {
    await fs.access(packageThemesDir);
    return packageThemesDir;
  } catch {
    return path.resolve("themes", theme);
  }
}

async function readThemeConfig(file: string): Promise<Partial<ThemeConfig>> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Partial<ThemeConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}
