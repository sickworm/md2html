import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const basicOutputDir = path.resolve("dist/basic");
const tmpDir = path.resolve("dist/fixture-inputs");

await execFileAsync("node", ["scripts/create-sample-image.mjs"]);
await execFileAsync("npm", ["run", "build"]);
await fs.rm(basicOutputDir, { recursive: true, force: true });
await fs.rm(tmpDir, { recursive: true, force: true });
await fs.mkdir(tmpDir, { recursive: true });

await verifyBasicFixture();
await verifyStyleDemoFixture();
await verifyNonLocalImages();
await verifyStrictMissingImageFailure();
await verifyMissingExplicitAssetsConfigFailure();
await verifyUnsafeHtmlHandling();
await verifyOutputResCleanupDoesNotDeleteSources();

console.log("Fixture verification passed");

async function verifyBasicFixture() {
  await runCli([
    "examples/basic/article.md",
    "--platform",
    "wechat",
    "--theme",
    "jugg-clean",
    "--assets-config",
    "examples/basic/article.assets.json",
    "-o",
    "dist/basic"
  ]);

  const requiredFiles = [
    "dist/basic/article.html",
    "dist/basic/article.inline.html",
    "dist/basic/article.assets.json",
    "dist/basic/report.json",
    "dist/basic/res/001.png",
    "dist/basic/res/002.png"
  ];

  for (const file of requiredFiles) {
    await fs.access(path.resolve(file));
  }

  const inlineHtml = await fs.readFile("dist/basic/article.inline.html", "utf8");
  assertIncludes(inlineHtml, "md2html-callout");
  assertIncludes(inlineHtml, "md2html-details-fallback");
  assertImageWidth(inlineHtml, "res/001.png", "260");
  assertImageWidth(inlineHtml, "res/002.png", "240");

  const assets = JSON.parse(await fs.readFile("dist/basic/article.assets.json", "utf8"));
  if (assets.images?.["001"]?.width !== 260) {
    throw new Error(`Expected assets image 001 width to be 260, got ${assets.images?.["001"]?.width}`);
  }
  if (assets.images?.["002"]?.width !== 240) {
    throw new Error(`Expected assets image 002 width to be 240, got ${assets.images?.["002"]?.width}`);
  }

  const report = JSON.parse(await fs.readFile("dist/basic/report.json", "utf8"));
  if (report.imagesCopied !== 2) {
    throw new Error(`Expected 2 copied images, got ${report.imagesCopied}`);
  }
  if (!report.warnings.some((warning) => warning.code === "details-downgraded")) {
    throw new Error("Expected details-downgraded warning");
  }
  if (report.warnings.some((warning) => warning.code === "unsupported-html")) {
    throw new Error("Expected basic fixture to avoid unsupported-html warnings");
  }

  await fs.writeFile(path.join(basicOutputDir, "res", "stale.txt"), "stale", "utf8");
  await runCli([
    "examples/basic/article.md",
    "--platform",
    "wechat",
    "--theme",
    "jugg-clean",
    "--assets-config",
    "examples/basic/article.assets.json",
    "-o",
    "dist/basic"
  ]);
  await assertExactFiles(path.join(basicOutputDir, "res"), ["001.png", "002.png"]);
}

async function verifyStyleDemoFixture() {
  const fixtureDir = path.join(tmpDir, "style-demo");
  const outputDir = path.resolve("dist/style-demo-fixture");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp("examples/style-demo", fixtureDir, { recursive: true });

  await runCli([
    path.join(fixtureDir, "article.md"),
    "--platform",
    "wechat",
    "--theme",
    "jugg-clean",
    "--assets-config",
    path.join(fixtureDir, "article.assets.json"),
    "--toc",
    "-o",
    outputDir
  ]);

  await fs.access(path.join(outputDir, "res", "001.png"));
  await fs.access(path.join(outputDir, "res", "002.png"));

  const inlineHtml = await fs.readFile(path.join(outputDir, "article.inline.html"), "utf8");
  assertImageWidth(inlineHtml, "res/001.png", "420");
  assertImageWidth(inlineHtml, "res/002.png", "240");

  const report = JSON.parse(await fs.readFile(path.join(outputDir, "report.json"), "utf8"));
  if (report.imagesCopied !== 2) {
    throw new Error(`Expected style demo to copy 2 images, got ${report.imagesCopied}`);
  }
  if (report.imagesMissing !== 0) {
    throw new Error(`Expected style demo to have no missing images, got ${report.imagesMissing}`);
  }
}

async function verifyNonLocalImages() {
  const fixtureDir = path.join(tmpDir, "non-local");
  const outputDir = path.resolve("dist/non-local");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.copyFile("examples/basic/res/sample.png", path.join(fixtureDir, "sample.png"));
  await fs.writeFile(
    path.join(fixtureDir, "article.md"),
    `# Non-local images

![Local](./sample.png)
![Remote](https://example.com/a.png)
![Protocol](//cdn.example.com/a.png)
![Data](data:image/png;base64,abc)
![Root](/uploads/a.png)
![File](file:///tmp/a.png)
<img src="C:/temp/a.png" alt="Windows absolute">
`,
    "utf8"
  );

  await runCli([
    path.join(fixtureDir, "article.md"),
    "--platform",
    "wechat",
    "--theme",
    "jugg-clean",
    "-o",
    outputDir
  ]);

  const inlineHtml = await fs.readFile(path.join(outputDir, "article.inline.html"), "utf8");
  assertIncludes(inlineHtml, 'src="res/001.png"');
  assertIncludes(inlineHtml, 'src="https://example.com/a.png"');
  assertIncludes(inlineHtml, 'src="//cdn.example.com/a.png"');
  assertIncludes(inlineHtml, 'src="data:image/png;base64,abc"');
  assertIncludes(inlineHtml, 'src="/uploads/a.png"');
  assertIncludes(inlineHtml, 'src="file:///tmp/a.png"');
  assertIncludes(inlineHtml, 'src="C:/temp/a.png"');
  await assertExactFiles(path.join(outputDir, "res"), ["001.png"]);

  const report = JSON.parse(await fs.readFile(path.join(outputDir, "report.json"), "utf8"));
  const skippedCount = report.warnings.filter((warning) => warning.code === "remote-image-skipped").length;
  if (skippedCount !== 6) {
    throw new Error(`Expected 6 non-local image warnings, got ${skippedCount}`);
  }
}

async function verifyStrictMissingImageFailure() {
  const fixtureDir = path.join(tmpDir, "missing-image");
  const outputDir = path.resolve("dist/missing-image");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.writeFile(
    path.join(fixtureDir, "article.md"),
    "# Missing image\n\n![Missing](./missing.png)\n",
    "utf8"
  );

  const result = await runCli(
    [path.join(fixtureDir, "article.md"), "--strict", "--platform", "wechat", "--theme", "jugg-clean", "-o", outputDir],
    { expectFailure: true }
  );
  assertIncludes(result.stderr, "Strict mode failed: one or more local images are missing");
}

async function verifyMissingExplicitAssetsConfigFailure() {
  const result = await runCli(
    [
      "examples/basic/article.md",
      "--platform",
      "wechat",
      "--theme",
      "jugg-clean",
      "--assets-config",
      path.join(tmpDir, "does-not-exist.json"),
      "-o",
      "dist/missing-assets-config"
    ],
    { expectFailure: true }
  );
  assertIncludes(result.stderr, "Assets config not found");
}

async function verifyUnsafeHtmlHandling() {
  const fixtureDir = path.join(tmpDir, "unsafe-html");
  const outputDir = path.resolve("dist/unsafe-html");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.copyFile("examples/basic/res/sample.png", path.join(fixtureDir, "sample.png"));
  await fs.writeFile(
    path.join(fixtureDir, "article.md"),
    `# Unsafe HTML

<script>alert(1)</script>
<img src="./sample.png" onerror="alert(1)" alt="Unsafe image">
<iframe src="https://example.com/embed"></iframe>
<video controls><source src="movie.mp4"></video>
`,
    "utf8"
  );

  await runCli([
    path.join(fixtureDir, "article.md"),
    "--platform",
    "wechat",
    "--theme",
    "jugg-clean",
    "-o",
    outputDir
  ]);

  const inlineHtml = await fs.readFile(path.join(outputDir, "article.inline.html"), "utf8");
  assertNotIncludes(inlineHtml, "<script");
  assertNotIncludes(inlineHtml, "<iframe");
  assertNotIncludes(inlineHtml, "onerror=");
  assertNotIncludes(inlineHtml, "<video");
  assertNotIncludes(inlineHtml, "<source");

  const report = JSON.parse(await fs.readFile(path.join(outputDir, "report.json"), "utf8"));
  if (!report.warnings.some((warning) => warning.code === "unsupported-html")) {
    throw new Error("Expected unsupported-html warning for unsafe raw HTML");
  }

  const strictResult = await runCli(
    [path.join(fixtureDir, "article.md"), "--strict", "--platform", "wechat", "--theme", "jugg-clean", "-o", outputDir],
    { expectFailure: true }
  );
  assertIncludes(strictResult.stderr, "Strict mode failed: unsafe or unsupported HTML was removed");
}

async function verifyOutputResCleanupDoesNotDeleteSources() {
  const fixtureDir = path.join(tmpDir, "output-res-overlap");
  const sourceResDir = path.join(fixtureDir, "res");
  const outputFile = path.join(fixtureDir, "article.inline.html");
  const sourceImage = path.join(sourceResDir, "sample.png");
  await fs.mkdir(sourceResDir, { recursive: true });
  await fs.copyFile("examples/basic/res/sample.png", sourceImage);
  await fs.writeFile(
    path.join(fixtureDir, "article.md"),
    "# Overlap\n\n![Sample](./res/sample.png)\n",
    "utf8"
  );

  const result = await runCli(
    [
      path.join(fixtureDir, "article.md"),
      "--platform",
      "wechat",
      "--theme",
      "jugg-clean",
      "-o",
      fixtureDir
    ],
    { expectFailure: true }
  );

  assertIncludes(
    result.stderr,
    "Refusing to clean output res directory because it contains source images"
  );
  assertIncludes(result.stderr, sourceImage);
  await fs.access(sourceImage);

  try {
    await fs.access(outputFile);
    throw new Error(`Expected conversion to fail before writing output file: ${outputFile}`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function runCli(args, options = {}) {
  try {
    const result = await execFileAsync("node", ["packages/cli/dist/index.js", ...args], {
      cwd: process.cwd()
    });
    if (options.expectFailure) {
      throw new Error(`Expected CLI to fail, but it succeeded: ${args.join(" ")}`);
    }
    return result;
  } catch (error) {
    if (!options.expectFailure) {
      throw error;
    }
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      code: error.code
    };
  }
}

async function assertExactFiles(dir, expectedFiles) {
  const entries = (await fs.readdir(dir)).sort();
  const actual = JSON.stringify(entries);
  const expected = JSON.stringify([...expectedFiles].sort());
  if (actual !== expected) {
    throw new Error(`Expected files ${expected} in ${dir}, got ${actual}`);
  }
}

function assertIncludes(content, needle) {
  if (!content.includes(needle)) {
    throw new Error(`Expected output to include: ${needle}`);
  }
}

function assertNotIncludes(content, needle) {
  if (content.includes(needle)) {
    throw new Error(`Expected output to exclude: ${needle}`);
  }
}

function assertImageWidth(html, src, width) {
  const pattern = new RegExp(
    `<img\\b(?=[^>]*\\bsrc="${escapeRegExp(src)}")(?=[^>]*\\bwidth="${escapeRegExp(width)}")[^>]*>`,
    "i"
  );
  if (!pattern.test(html)) {
    throw new Error(`Expected <img> tag for ${src} with width="${width}"`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
