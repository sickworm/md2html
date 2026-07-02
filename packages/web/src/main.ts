import { createIcons, icons } from "lucide";
import "./styles.css";

type PlatformId = "generic" | "wechat" | "km" | "lexiang";

interface EncodedFile {
  path: string;
  contentBase64: string;
}

interface ArticleAssets {
  images: Record<string, { source: string; width?: number }>;
}

interface ImageManifestItem {
  id: string;
  source: string;
  outputRelativePath: string;
  alt?: string;
  originalWidth?: number;
  originalHeight?: number;
  displayWidth: number;
  missing: boolean;
  remote: boolean;
}

interface ConversionWarning {
  code: string;
  message: string;
  source?: string;
}

interface ConvertResponse {
  jobId: string;
  previewUrl: string;
  imageBaseUrl: string;
  inlineHtml: string;
  assets: ArticleAssets;
  imageManifest: ImageManifestItem[];
  report: {
    warnings: ConversionWarning[];
    imagesCopied: number;
    imagesMissing: number;
  };
}

const state: {
  markdown: string;
  inputFilePath: string;
  articleName: string;
  platform: PlatformId;
  theme: string;
  toc: boolean;
  uiTheme: "light" | "dark";
  viewport: "article" | "phone";
  sourceCollapsed: boolean;
  files: EncodedFile[];
  assets: ArticleAssets | null;
  result: ConvertResponse | null;
} = {
  markdown: "",
  inputFilePath: "article.md",
  articleName: "article",
  platform: "generic",
  theme: "jugg-clean",
  toc: false,
  uiTheme: readUiTheme(),
  viewport: "article",
  sourceCollapsed: readSourceCollapsed(),
  files: [],
  assets: null,
  result: null
};

let convertTimer: number | undefined;
let convertSerial = 0;
let sourceDragDepth = 0;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><i data-lucide="braces"></i></div>
        <div>
          <h1>md2html</h1>
          <p id="articleMeta">article.md</p>
        </div>
      </div>
      <div class="topbar-controls">
        <div class="segmented" id="platformGroup" aria-label="平台">
          <button data-platform="generic" type="button">Generic</button>
          <button data-platform="wechat" type="button">WeChat</button>
          <button data-platform="km" type="button">KM</button>
          <button data-platform="lexiang" type="button">Lexiang</button>
        </div>
        <label class="select-wrap">
          <span>主题</span>
          <select id="themeSelect"></select>
        </label>
        <label class="switch">
          <input id="tocToggle" type="checkbox" />
          <span>TOC</span>
        </label>
        <button class="icon-button" id="uiThemeButton" type="button" title="切换界面主题">
          <i data-lucide="sun-moon"></i>
        </button>
      </div>
    </header>

    <section class="workspace">
      <section class="source-pane panel" id="sourcePane">
        <div class="panel-head">
          <div>
            <h2>Markdown</h2>
            <p id="fileCount">未选择文件</p>
          </div>
          <div class="panel-actions">
            <button class="tool-button" id="openMarkdown" type="button"><i data-lucide="file-text"></i><span>文件</span></button>
            <button class="tool-button" id="openFolder" type="button"><i data-lucide="folder-open"></i><span>目录</span></button>
            <button class="tool-button" id="loadExample" type="button"><i data-lucide="flask-conical"></i><span>示例</span></button>
            <button class="icon-button" id="toggleSourcePane" type="button" title="收起 Markdown 区" aria-label="收起 Markdown 区">
              <i data-lucide="panel-left-close"></i>
            </button>
          </div>
        </div>
        <div class="source-content">
          <select id="articleFileSelect" class="article-select" aria-label="Markdown 文件"></select>
          <textarea id="markdownInput" spellcheck="false" placeholder="# 标题"></textarea>
          <input id="markdownFileInput" type="file" hidden />
          <input id="folderInput" type="file" webkitdirectory directory multiple hidden />
        </div>
      </section>

      <section class="preview-pane panel">
        <div class="panel-head">
          <div>
            <h2>预览</h2>
            <p id="convertStatus">等待输入</p>
          </div>
          <div class="segmented small" id="viewportGroup" aria-label="预览宽度">
            <button data-viewport="article" type="button">文章</button>
            <button data-viewport="phone" type="button">手机</button>
          </div>
        </div>
        <div class="preview-stage" id="previewStage">
          <iframe id="previewFrame" title="平台预览"></iframe>
        </div>
      </section>

      <aside class="assets-pane panel">
        <div class="panel-head">
          <div>
            <h2>输出</h2>
            <p id="assetSummary">无图片</p>
          </div>
        </div>
        <div class="copy-grid">
          <button class="primary-action" id="copyRich" type="button"><i data-lucide="clipboard-copy"></i><span>复制富文本</span></button>
          <button class="tool-button wide" id="copyInline" type="button"><i data-lucide="code-xml"></i><span>复制 inline HTML</span></button>
          <button class="tool-button wide" id="exportAssets" type="button"><i data-lucide="download"></i><span>导出 article.assets.json</span></button>
        </div>
        <div class="image-list" id="imageList"></div>
        <div class="warnings" id="warnings"></div>
      </aside>
    </section>
  </main>
`;

createIcons({ icons });
document.documentElement.dataset.theme = state.uiTheme;

const markdownInput = getElement<HTMLTextAreaElement>("markdownInput");
const markdownFileInput = getElement<HTMLInputElement>("markdownFileInput");
const folderInput = getElement<HTMLInputElement>("folderInput");
const articleFileSelect = getElement<HTMLSelectElement>("articleFileSelect");
const sourcePane = getElement("sourcePane");
const workspace = document.querySelector<HTMLElement>(".workspace")!;

getElement("openMarkdown").addEventListener("click", () => markdownFileInput.click());
getElement("openFolder").addEventListener("click", () => folderInput.click());
getElement("loadExample").addEventListener("click", loadExample);
getElement("copyInline").addEventListener("click", copyInlineHtml);
getElement("copyRich").addEventListener("click", copyRichText);
getElement("exportAssets").addEventListener("click", exportAssets);
getElement("uiThemeButton").addEventListener("click", toggleUiTheme);
getElement("toggleSourcePane").addEventListener("click", toggleSourcePane);
sourcePane.addEventListener("dragenter", handleSourceDragEnter);
sourcePane.addEventListener("dragover", handleSourceDragOver);
sourcePane.addEventListener("dragleave", handleSourceDragLeave);
sourcePane.addEventListener("drop", handleSourceDrop);

markdownInput.addEventListener("input", () => {
  state.markdown = markdownInput.value;
  scheduleConvert();
});

markdownFileInput.addEventListener("change", async () => {
  const file = markdownFileInput.files?.[0];
  if (!file) {
    return;
  }

  if (!isMarkdownPath(file.name)) {
    showStatus("请选择 Markdown 文件（.md 或 .markdown）", true);
    markdownFileInput.value = "";
    return;
  }

  await importFiles([await encodeFile(file, file.name)], file.name);
  markdownFileInput.value = "";
});

folderInput.addEventListener("change", async () => {
  const files = [...(folderInput.files ?? [])];
  if (files.length === 0) {
    return;
  }

  await importFiles(await Promise.all(files.map((file) => encodeFile(file, filePath(file)))));
  folderInput.value = "";
});

articleFileSelect.addEventListener("change", () => {
  selectArticleFile(articleFileSelect.value);
  state.assets = null;
  renderMeta();
  scheduleConvert(0);
});

getElement("themeSelect").addEventListener("change", (event) => {
  state.theme = (event.target as HTMLSelectElement).value;
  scheduleConvert(0);
});

getElement("tocToggle").addEventListener("change", (event) => {
  state.toc = (event.target as HTMLInputElement).checked;
  scheduleConvert(0);
});

getElement("platformGroup").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-platform]");
  if (!button) {
    return;
  }

  state.platform = button.dataset.platform as PlatformId;
  renderMeta();
  scheduleConvert(0);
});

getElement("viewportGroup").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-viewport]");
  if (!button) {
    return;
  }

  state.viewport = button.dataset.viewport as "article" | "phone";
  renderPreviewShell();
});

renderSourcePane();
void initialize();

async function initialize(): Promise<void> {
  await loadThemes();
  await loadExample();
}

function scheduleConvert(delay = 300): void {
  window.clearTimeout(convertTimer);
  convertTimer = window.setTimeout(convertNow, delay);
}

async function convertNow(): Promise<void> {
  const markdown = state.markdown.trim();
  if (!markdown) {
    showStatus("等待输入");
    return;
  }

  const serial = ++convertSerial;
  showStatus("转换中");

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown: state.markdown,
        inputFilePath: state.inputFilePath,
        platform: state.platform,
        theme: state.theme,
        toc: state.toc,
        assets: state.assets,
        files: state.files
      })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    const result = await response.json() as ConvertResponse;
    if (serial !== convertSerial) {
      return;
    }

    state.result = result;
    state.assets = mergeAssets(result.assets, state.assets);
    renderResult();
    showStatus("已转换");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function loadThemes(): Promise<void> {
  const response = await fetch("/api/themes");
  const { themes } = await response.json() as { themes: string[] };
  const themeSelect = getElement<HTMLSelectElement>("themeSelect");
  themeSelect.innerHTML = themes.map((theme) => `<option value="${escapeAttr(theme)}">${escapeHtml(theme)}</option>`).join("");
  state.theme = themes.includes("jugg-clean") ? "jugg-clean" : (themes[0] ?? "jugg-clean");
  themeSelect.value = state.theme;
}

async function loadExample(): Promise<void> {
  const response = await fetch("/api/examples/style-demo");
  const example = await response.json() as {
    articleName: string;
    inputFilePath: string;
    markdown: string;
    files: EncodedFile[];
  };
  state.articleName = example.articleName;
  state.inputFilePath = example.inputFilePath;
  state.markdown = example.markdown;
  state.files = example.files;
  state.assets = null;
  markdownInput.value = state.markdown;
  renderArticleSelect();
  renderMeta();
  scheduleConvert(0);
}

function renderResult(): void {
  const result = state.result;
  if (!result) {
    return;
  }

  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  previewFrame.src = `${result.previewUrl}?t=${Date.now()}`;
  renderPreviewShell();
  renderMeta();
  renderImages();
  renderWarnings();
}

function renderImages(): void {
  const result = state.result;
  const imageList = getElement("imageList");
  if (!result) {
    imageList.innerHTML = "";
    return;
  }

  const localImages = result.imageManifest.filter((image) => !image.remote);
  getElement("assetSummary").textContent =
    `${result.report.imagesCopied} 张可用，${result.report.imagesMissing} 张缺失`;

  if (localImages.length === 0) {
    imageList.innerHTML = `<div class="empty-state">没有本地图片</div>`;
    return;
  }

  imageList.innerHTML = localImages.map((image) => {
    const width = state.assets?.images[image.id]?.width ?? image.displayWidth;
    const previewSrc = image.missing
      ? ""
      : `${result.imageBaseUrl}${image.outputRelativePath}`;
    return `
      <article class="image-item" data-image-id="${escapeAttr(image.id)}">
        <div class="thumb">
          ${previewSrc ? `<img src="${escapeAttr(previewSrc)}" alt="${escapeAttr(image.alt ?? image.source)}" />` : `<i data-lucide="image-off"></i>`}
        </div>
        <div class="image-main">
          <div class="image-title">
            <strong>${escapeHtml(image.id || "remote")}</strong>
            <span>${escapeHtml(image.source)}</span>
          </div>
          <div class="width-control">
            <input type="range" min="80" max="900" step="10" value="${width}" ${image.missing ? "disabled" : ""} />
            <input type="number" min="1" max="2000" step="1" value="${width}" ${image.missing ? "disabled" : ""} />
            <span>px</span>
          </div>
        </div>
      </article>
    `;
  }).join("");

  createIcons({ icons });
  imageList.querySelectorAll<HTMLElement>(".image-item").forEach((item) => {
    const id = item.dataset.imageId;
    const range = item.querySelector<HTMLInputElement>("input[type='range']");
    const number = item.querySelector<HTMLInputElement>("input[type='number']");
    if (!id || !range || !number) {
      return;
    }

    const updateWidth = (value: string): void => {
      const width = Math.max(1, Math.round(Number(value) || 1));
      state.assets ??= structuredClone(result.assets);
      state.assets.images[id] = {
        ...state.assets.images[id],
        width
      };
      range.value = String(width);
      number.value = String(width);
      scheduleConvert();
    };

    range.addEventListener("input", () => updateWidth(range.value));
    number.addEventListener("change", () => updateWidth(number.value));
  });
}

function renderWarnings(): void {
  const warnings = state.result?.report.warnings ?? [];
  const target = getElement("warnings");
  if (warnings.length === 0) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = `
    <h3>警告</h3>
    ${warnings.map((warning) => `<p>${escapeHtml(warning.message)}</p>`).join("")}
  `;
}

function renderArticleSelect(): void {
  const markdownFiles = state.files.filter((file) => isMarkdownPath(file.path));
  articleFileSelect.innerHTML = markdownFiles.map((file) =>
    `<option value="${escapeAttr(file.path)}">${escapeHtml(file.path)}</option>`
  ).join("");
  articleFileSelect.value = state.inputFilePath;
  articleFileSelect.hidden = markdownFiles.length <= 1;
}

function renderMeta(): void {
  getElement("articleMeta").textContent = `${state.inputFilePath} · ${state.platform}`;
  getElement("fileCount").textContent =
    state.files.length > 0 ? `${state.files.length} 个本地文件` : "未选择文件";

  document.querySelectorAll<HTMLButtonElement>("#platformGroup button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.platform === state.platform);
  });
}

function renderPreviewShell(): void {
  const stage = getElement("previewStage");
  stage.classList.toggle("is-phone", state.viewport === "phone");
  document.querySelectorAll<HTMLButtonElement>("#viewportGroup button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewport === state.viewport);
  });
}

function renderSourcePane(): void {
  sourcePane.classList.toggle("is-collapsed", state.sourceCollapsed);
  workspace.classList.toggle("source-collapsed", state.sourceCollapsed);

  const toggleButton = getElement<HTMLButtonElement>("toggleSourcePane");
  const label = state.sourceCollapsed ? "展开 Markdown 区" : "收起 Markdown 区";
  toggleButton.title = label;
  toggleButton.setAttribute("aria-label", label);
  toggleButton.innerHTML = `<i data-lucide="${state.sourceCollapsed ? "panel-left-open" : "panel-left-close"}"></i>`;
  createIcons({ icons });
}

function showStatus(message: string, isError = false): void {
  const status = getElement("convertStatus");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function selectArticleFile(pathValue: string): void {
  const file = state.files.find((item) => item.path === pathValue);
  if (!file) {
    return;
  }

  state.inputFilePath = file.path;
  state.articleName = file.path.split("/").pop()?.replace(/\.[^.]+$/, "") || "article";
  state.markdown = decodeBase64(file.contentBase64);
  markdownInput.value = state.markdown;
}

async function copyInlineHtml(): Promise<void> {
  if (!state.result) {
    return;
  }

  await navigator.clipboard.writeText(state.result.inlineHtml);
  showStatus("inline HTML 已复制");
}

async function copyRichText(): Promise<void> {
  if (!state.result) {
    return;
  }

  const html = absolutizeImageSources(state.result.inlineHtml, state.result.imageBaseUrl);
  const text = htmlToText(html);

  if ("ClipboardItem" in window) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      })
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }

  showStatus("富文本已复制");
}

function exportAssets(): void {
  const assets = state.assets ?? state.result?.assets;
  if (!assets) {
    return;
  }

  downloadBlob("article.assets.json", JSON.stringify(assets, null, 2), "application/json");
}

function mergeAssets(nextAssets: ArticleAssets, previousAssets: ArticleAssets | null): ArticleAssets {
  if (!previousAssets) {
    return structuredClone(nextAssets);
  }

  return {
    images: Object.fromEntries(Object.entries(nextAssets.images).map(([id, image]) => [
      id,
      {
        ...image,
        width: previousAssets.images[id]?.width ?? image.width
      }
    ]))
  };
}

function toggleUiTheme(): void {
  state.uiTheme = state.uiTheme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = state.uiTheme;
  localStorage.setItem("md2html-ui-theme", state.uiTheme);
}

function toggleSourcePane(): void {
  state.sourceCollapsed = !state.sourceCollapsed;
  localStorage.setItem("md2html-source-collapsed", String(state.sourceCollapsed));
  renderSourcePane();
}

async function handleSourceDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  sourceDragDepth = 0;
  setSourceDragging(false);

  const files = await readDroppedFiles(event.dataTransfer);
  if (files.length === 0) {
    showStatus("未找到可导入文件", true);
    return;
  }

  await importFiles(files);
}

function handleSourceDragEnter(event: DragEvent): void {
  if (!hasDroppableFiles(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  sourceDragDepth += 1;
  setSourceDragging(true);
}

function handleSourceDragOver(event: DragEvent): void {
  if (!hasDroppableFiles(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function handleSourceDragLeave(event: DragEvent): void {
  if (!hasDroppableFiles(event.dataTransfer)) {
    return;
  }

  sourceDragDepth = Math.max(0, sourceDragDepth - 1);
  if (sourceDragDepth === 0) {
    setSourceDragging(false);
  }
}

function setSourceDragging(isDragging: boolean): void {
  sourcePane.classList.toggle("is-dragging", isDragging);
}

async function importFiles(files: EncodedFile[], preferredPath?: string): Promise<void> {
  state.files = files;
  const markdownFiles = state.files.filter((file) => isMarkdownPath(file.path));
  const selected = preferredPath
    ? markdownFiles.find((file) => file.path === preferredPath)
    : markdownFiles.find((file) => file.path.endsWith("/article.md")) ?? markdownFiles[0];
  if (!selected) {
    showStatus("目录中没有 Markdown", true);
    return;
  }

  selectArticleFile(selected.path);
  state.assets = null;
  renderArticleSelect();
  renderMeta();
  scheduleConvert(0);
}

async function encodeFile(file: File, relativePath: string): Promise<EncodedFile> {
  const buffer = await file.arrayBuffer();
  return {
    path: relativePath.replaceAll("\\", "/"),
    contentBase64: arrayBufferToBase64(buffer)
  };
}

function filePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function isMarkdownPath(pathValue: string): boolean {
  return /\.(md|markdown)$/i.test(pathValue);
}

async function readDroppedFiles(dataTransfer: DataTransfer | null): Promise<EncodedFile[]> {
  if (!dataTransfer) {
    return [];
  }

  const entries = [...dataTransfer.items]
    .map((item) => (item as DataTransferItem & {
      webkitGetAsEntry?: () => FileSystemEntry | null;
    }).webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length > 0) {
    const nestedFiles = await Promise.all(entries.map((entry) => encodeEntry(entry)));
    return nestedFiles.flat();
  }

  return Promise.all([...dataTransfer.files].map((file) => encodeFile(file, file.name)));
}

async function encodeEntry(entry: FileSystemEntry): Promise<EncodedFile[]> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    return [await encodeFile(file, entryPath(entry) || file.name)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const entries = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
  const nestedFiles = await Promise.all(entries.map((child) => encodeEntry(child)));
  return nestedFiles.flat();
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      return entries;
    }

    entries.push(...batch);
  }
}

function entryPath(entry: FileSystemEntry): string {
  return (entry.fullPath || entry.name).replace(/^\/+/, "");
}

function hasDroppableFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer?.types.includes("Files"));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function absolutizeImageSources(html: string, imageBaseUrl: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const base = new URL(imageBaseUrl, window.location.origin);
  wrapper.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const src = image.getAttribute("src");
    if (src && !/^(https?:|data:|blob:|file:)/i.test(src)) {
      image.src = new URL(src, base).href;
    }
  });
  return wrapper.innerHTML;
}

function htmlToText(html: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.textContent?.trim() ?? "";
}

function downloadBlob(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readUiTheme(): "light" | "dark" {
  return localStorage.getItem("md2html-ui-theme") === "dark" ? "dark" : "light";
}

function readSourceCollapsed(): boolean {
  return localStorage.getItem("md2html-source-collapsed") === "true";
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
