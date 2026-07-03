import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ThemeConfig {
  contentMaxWidth: number;
  fontFamily: string;
  imageMaxWidth: number;
  codeLineWrap: boolean;
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
export async function loadTheme(theme = "jugg-clean-v2"): Promise<LoadedTheme> {
  const directory = theme.includes("/") || theme.includes("\\")
    ? path.resolve(theme)
    : await resolveNamedThemeDirectory(theme);
  const name = path.basename(directory);
  const css = await fs.readFile(path.join(directory, "theme.css"), "utf8");
  const config = await readThemeConfig(path.join(directory, "theme.json"));

  return {
    name,
    directory,
    css,
    config: {
      ...defaultConfig,
      ...config
    }
  };
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
