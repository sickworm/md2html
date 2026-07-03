import crypto from "node:crypto";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { convertMarkdown, type ArticleAssets, type PlatformId } from "@md2html/core";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const app = express();
const httpServer = createHttpServer(app);
interface JobOutput {
  outputDir: string;
  htmlName: string;
}
const outputDirs = new Map<string, JobOutput>();
const defaultPort = Number(process.env.PORT ?? 4576);

app.use(express.json({ limit: "80mb" }));

app.get("/api/themes", async (_req, res, next) => {
  try {
    const themesDir = path.join(rootDir, "themes");
    const entries = await fs.readdir(themesDir, { withFileTypes: true });
    res.json({
      themes: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/examples/style-demo", async (_req, res, next) => {
  try {
    const exampleDir = path.join(rootDir, "examples/style-demo");
    const files = await readDirectoryFiles(exampleDir);
    const article = files.find((file) => file.path === "article.md");
    res.json({
      articleName: "style-demo",
      inputFilePath: "article.md",
      markdown: article ? Buffer.from(article.contentBase64, "base64").toString("utf8") : "",
      files
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/convert", async (req, res, next) => {
  try {
    const body = req.body as ConvertRequest;
    const platform = parsePlatform(body.platform);
    const theme = typeof body.theme === "string" && body.theme.trim() ? body.theme : "jugg-clean-v2";
    const jobId = crypto.randomUUID();
    const jobRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md2html-web-"));
    const inputRelativePath = safeRelativePath(body.inputFilePath || "article.md");
    const inputFile = path.join(jobRoot, inputRelativePath);

    for (const file of body.files ?? []) {
      const relativePath = safeRelativePath(file.path);
      const target = path.join(jobRoot, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(file.contentBase64, "base64"));
    }

    await fs.mkdir(path.dirname(inputFile), { recursive: true });
    await fs.writeFile(inputFile, String(body.markdown ?? ""), "utf8");

    const assetsConfig = body.assets
      ? await writeAssetsConfig(jobRoot, inputRelativePath, body.assets)
      : undefined;
    const outputDir = path.join(jobRoot, "out");
    const result = await convertMarkdown({
      inputFile,
      outputDir,
      platform,
      theme,
      assetsConfig,
      toc: Boolean(body.toc)
    });

    const htmlName = path.basename(result.outputFiles.html);
    outputDirs.set(jobId, { outputDir, htmlName });
    res.json({
      jobId,
      previewUrl: `/api/outputs/${jobId}/${encodeURIComponent(htmlName)}`,
      imageBaseUrl: `/api/outputs/${jobId}/`,
      html: result.html,
      inlineHtml: result.inlineHtml,
      assets: result.assets,
      imageManifest: result.imageManifest,
      report: result.report
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/outputs/:jobId/*", async (req, res, next) => {
  try {
    const outputDir = outputDirs.get(req.params.jobId)?.outputDir;
    if (!outputDir) {
      res.status(404).send("Output not found");
      return;
    }

    const params = req.params as { jobId: string; 0?: string };
    const requestedPath = safeRelativePath(params[0] || "");
    const target = path.resolve(outputDir, requestedPath);
    if (!isPathInsideOrEqual(target, outputDir)) {
      res.status(403).send("Forbidden");
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.sendFile(target);
  } catch (error) {
    next(error);
  }
});

app.post("/api/export", async (req, res, next) => {
  try {
    const { jobId, articleName } = req.body as { jobId?: string; articleName?: string };
    const job = jobId ? outputDirs.get(jobId) : undefined;
    if (!job) {
      res.status(404).json({ error: "转换结果已失效，请重新转换后再导出" });
      return;
    }

    const folderName = sanitizeFolderName(articleName || "article");
    const downloadsDir = path.join(os.homedir(), "Downloads");
    const targetDir = await uniqueDirectory(downloadsDir, folderName);

    await fs.mkdir(targetDir, { recursive: true });

    const resDir = path.join(job.outputDir, "res");
    await fs.cp(resDir, path.join(targetDir, "res"), { recursive: true }).catch(() => undefined);

    const htmlContent = await fs.readFile(path.join(job.outputDir, job.htmlName), "utf8");
    await fs.writeFile(path.join(targetDir, "index.html"), htmlContent, "utf8");

    res.json({ path: targetDir });
  } catch (error) {
    next(error);
  }
});

/** 在 Finder 中打开指定目录(macOS)。 */
app.post("/api/reveal", async (req, res, next) => {
  try {
    const { path: target } = req.body as { path?: string };
    if (!target) {
      res.status(400).json({ error: "缺少 path 参数" });
      return;
    }
    if (process.platform !== "darwin") {
      res.status(400).json({ error: "仅支持 macOS" });
      return;
    }
    exec(`open "${target}"`, (error) => {
      if (error) {
        next(error);
        return;
      }
      res.json({ ok: true });
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(packageDir, "dist/client")));
} else {
  const vite = await createViteServer({
    root: packageDir,
    server: {
      hmr: { server: httpServer },
      middlewareMode: true
    },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

const port = await listenWithAvailablePort(defaultPort, httpServer);
console.log(`md2html Web UI: http://localhost:${port}`);

interface ConvertRequest {
  markdown?: string;
  inputFilePath?: string;
  platform?: string;
  theme?: string;
  toc?: boolean;
  assets?: ArticleAssets;
  files?: EncodedFile[];
}

interface EncodedFile {
  path: string;
  contentBase64: string;
}

async function readDirectoryFiles(directory: string, prefix = ""): Promise<EncodedFile[]> {
  const entries = await fs.readdir(path.join(directory, prefix), { withFileTypes: true });
  const files: EncodedFile[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await readDirectoryFiles(directory, relativePath));
      continue;
    }

    const content = await fs.readFile(path.join(directory, relativePath));
    files.push({
      path: relativePath,
      contentBase64: content.toString("base64")
    });
  }

  return files;
}

async function writeAssetsConfig(
  jobRoot: string,
  inputRelativePath: string,
  assets: ArticleAssets
): Promise<string> {
  const assetsFile = path.join(jobRoot, path.dirname(inputRelativePath), "__web.assets.json");
  await fs.writeFile(assetsFile, JSON.stringify(assets, null, 2), "utf8");
  return assetsFile;
}

function parsePlatform(value: unknown): PlatformId {
  if (value === "wechat" || value === "km" || value === "lexiang" || value === "generic") {
    return value;
  }

  return "generic";
}

function safeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`Invalid relative path: ${value}`);
  }

  return normalized;
}

function isPathInsideOrEqual(targetPath: string, directoryPath: string): boolean {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/** 将文章名清理为合法的单层文件夹名,去掉路径分隔符与非法字符。 */
function sanitizeFolderName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/^\.+/, "");
  return cleaned || "article";
}

/** 在 downloadsDir 下生成不冲突的目录名,已存在时追加 -2、-3 后缀。 */
async function uniqueDirectory(parent: string, baseName: string): Promise<string> {
  const candidate = path.join(parent, baseName);
  if (!(await pathExists(candidate))) {
    return candidate;
  }

  for (let index = 2; index < 1000; index += 1) {
    const next = path.join(parent, `${baseName}-${index}`);
    if (!(await pathExists(next))) {
      return next;
    }
  }

  throw new Error(`导出目录已存在过多同名文件夹: ${baseName}`);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listenWithAvailablePort(startPort: number, server: Server): Promise<number> {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = startPort + offset;
    try {
      await listen(server, port);
      return port;
    } catch (error) {
      if (!isPortInUseError(error)) {
        throw error;
      }

      console.warn(`Port ${port} is already in use, trying ${port + 1}...`);
    }
  }

  throw new Error(`No available port found from ${startPort} to ${startPort + 19}`);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleListening = () => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      server.off("listening", handleListening);
      server.off("error", handleError);
    };

    server.once("listening", handleListening);
    server.once("error", handleError);
    server.listen(port);
  });
}

function isPortInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
