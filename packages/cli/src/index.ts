#!/usr/bin/env node

import path from "node:path";
import {spawn, type ChildProcess} from "node:child_process";
import { Command } from "commander";
import { convertMarkdown, type PlatformId } from "@md2html/core";

const program = new Command();

program
  .name("md2html")
  .description("Convert Markdown articles to platform-friendly HTML")
  .argument("<input>", "Markdown file")
  .option("--platform <platform>", "generic | wechat | km | lexiang", "generic")
  .option("--theme <theme>", "theme name or theme directory", "jugg-clean")
  .option("-o, --out <dir>", "output directory")
  .option("--assets-config <file>", "article assets JSON file")
  .option("--toc", "generate table of contents", false)
  .option("--strict", "fail on strict conversion warnings", false)
  .option("--open", "open local preview after conversion", false)
  .action(async (input: string, options: CliOptions) => {
    try {
      const inputFile = path.resolve(input);
      const outputDir = path.resolve(options.out ?? defaultOutputDir(inputFile));
      const platform = parsePlatform(options.platform);
      const result = await convertMarkdown({
        inputFile,
        outputDir,
        platform,
        theme: options.theme,
        assetsConfig: options.assetsConfig ? path.resolve(options.assetsConfig) : undefined,
        toc: options.toc,
        strict: options.strict
      });

      printSummary(result);

      if (options.open) {
        const preview = openPreview(result.outputFiles.html);
        let warned = false;
        const warn = (error: unknown): void => {
          if (warned) {
            return;
          }

          warned = true;
          console.warn(`Warning: failed to open preview: ${getErrorMessage(error)}`);
        };

        preview.once("error", warn);
        preview.once("close", (exitCode) => {
          if (exitCode !== 0) {
            warn(new Error(`Exited with code ${exitCode}`));
          }
        });
      }
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  });

void program.parseAsync();

interface CliOptions {
  platform: string;
  theme: string;
  out?: string;
  assetsConfig?: string;
  toc: boolean;
  strict: boolean;
  open: boolean;
}

function defaultOutputDir(inputFile: string): string {
  const name = path.basename(inputFile, path.extname(inputFile));
  return path.resolve("dist", name);
}

function parsePlatform(value: string): PlatformId {
  if (value === "generic" || value === "wechat" || value === "km" || value === "lexiang") {
    return value;
  }

  throw new Error(`Unsupported platform: ${value}`);
}

function printSummary(result: Awaited<ReturnType<typeof convertMarkdown>>): void {
  console.log(`Converted: ${formatSummaryPath(result.report.inputFile)}`);
  console.log(`Platform: ${result.report.platform}`);
  console.log(`Theme: ${result.report.theme}`);
  console.log(`Images: ${result.report.imagesCopied} copied, ${result.report.imagesMissing} missing`);
  console.log("Output:");
  console.log(`- ${formatSummaryPath(result.outputFiles.html)}`);
  console.log(`- ${formatSummaryPath(result.outputFiles.inlineHtml)}`);

  if (result.report.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.report.warnings) {
      console.log(`- ${warning.message}`);
    }
  }
}

function formatSummaryPath(file: string): string {
  const relative = path.relative(process.cwd(), file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return file;
  }

  return relative;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openPreview(target: string): ChildProcess {
  if (process.platform === "darwin") {
    const preview = spawn("open", [target], {detached: true, stdio: "ignore"});
    preview.unref();
    return preview;
  }

  if (process.platform === "win32") {
    const preview = spawn("cmd", ["/c", "start", "", target], {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: true
    });
    preview.unref();
    return preview;
  }

  const preview = spawn("xdg-open", [target], {detached: true, stdio: "ignore"});
  preview.unref();
  return preview;
}
