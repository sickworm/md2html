import { createIcons, icons } from "lucide";
import { highlightMarkdown } from "./markdown-highlight.js";
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
  html: string;
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
  outputCollapsed: boolean;
  files: EncodedFile[];
  assets: ArticleAssets | null;
  result: ConvertResponse | null;
} = {
  markdown: "",
  inputFilePath: "article.md",
  articleName: "article",
  platform: "generic",
  theme: "jugg-clean-v4",
  toc: false,
  uiTheme: readUiTheme(),
  viewport: "article",
  sourceCollapsed: readSourceCollapsed(),
  outputCollapsed: readOutputCollapsed(),
  files: [],
  assets: null,
  result: null
};

let convertTimer: number | undefined;
let convertSerial = 0;
let sourceDragDepth = 0;
let highlightRaf = 0;
let saveTimer: number | undefined;
let markdownDirty = false;
let assetsDirty = false;
/** 程序化设置 scrollTop 的时间戳，用于在 scroll 事件中区分"人为"和"程序"滚动 */
let lastProgrammaticSourceScroll = 0;
let lastProgrammaticPreviewScroll = 0;
const SYNC_GUARD_MS = 80;
interface PreviewAnchor { el: Element; line: number }
let previewAnchors: PreviewAnchor[] = [];
let previewScrollTarget: number | null = null;
let previewScrollRaf = 0;
/** 补偿预览元素 margin-top / padding 导致的视觉偏移（px） */
const ANCHOR_OFFSET = 12;
let activeFileHandle: FileSystemFileHandle | null = null;
let activeDirHandle: FileSystemDirectoryHandle | null = null;
const fsAccessSupported = typeof window.showOpenFilePicker === "function"
  && typeof window.showDirectoryPicker === "function";

const MIN_SOURCE_WIDTH = 280;
const MIN_PREVIEW_WIDTH = 360;
const MIN_OUTPUT_WIDTH = 280;
const RESIZER_WIDTH = 8;

let activeResize: {
  target: "source" | "output";
  startX: number;
  startWidth: number;
  otherWidth: number;
} | null = null;

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
            <p id="saveStatus" class="save-status"></p>
          </div>
          <div class="panel-actions">
            <button class="tool-button" id="openMarkdown" type="button"><i data-lucide="file-text"></i><span>文件</span></button>
            <button class="tool-button" id="openFolder" type="button"><i data-lucide="folder-open"></i><span>目录</span></button>
            <button class="tool-button" id="loadExample" type="button"><i data-lucide="flask-conical"></i><span>示例</span></button>
            <button class="tool-button" id="showShortcuts" type="button"><i data-lucide="keyboard"></i><span>快捷键</span></button>
            <button class="icon-button" id="toggleSourcePane" type="button" title="收起 Markdown 区" aria-label="收起 Markdown 区">
              <i data-lucide="panel-left-close"></i>
            </button>
          </div>
        </div>
        <div class="source-content">
          <select id="articleFileSelect" class="article-select" aria-label="Markdown 文件"></select>
          <div class="markdown-editor">
            <div id="markdownMirror" class="markdown-mirror" aria-hidden="true"></div>
            <pre id="markdownHighlight" class="markdown-highlight" aria-hidden="true"></pre>
            <textarea id="markdownInput" spellcheck="false" placeholder="# 标题"></textarea>
          </div>
          <input id="markdownFileInput" type="file" hidden />
          <input id="folderInput" type="file" webkitdirectory directory multiple hidden />
        </div>
      </section>

      <div class="resizer" data-resize="source" aria-hidden="true"></div>

      <section class="preview-pane panel">
        <div class="panel-head">
          <div>
            <h2>预览</h2>
            <p id="convertStatus">等待输入</p>
          </div>
          <div class="panel-actions">
            <button class="icon-button" id="reloadPreview" type="button" title="重新加载文件和 CSS" aria-label="重新加载文件和 CSS">
              <i data-lucide="refresh-cw"></i>
            </button>
            <div class="segmented small" id="viewportGroup" aria-label="预览宽度">
              <button data-viewport="article" type="button">文章</button>
              <button data-viewport="phone" type="button">手机</button>
            </div>
          </div>
        </div>
        <div class="preview-stage" id="previewStage">
          <iframe id="previewFrame" title="平台预览"></iframe>
        </div>
      </section>

      <div class="resizer" data-resize="output" aria-hidden="true"></div>

      <aside class="assets-pane panel" id="assetsPane">
        <div class="panel-head">
          <div>
            <h2>输出</h2>
            <p id="assetSummary">无图片</p>
          </div>
          <div class="panel-actions">
            <button class="icon-button" id="toggleOutputPane" type="button" title="收起输出区" aria-label="收起输出区">
              <i data-lucide="panel-right-close"></i>
            </button>
          </div>
        </div>
        <div class="copy-grid">
          <button class="primary-action" id="copyRich" type="button"><i data-lucide="clipboard-copy"></i><span>复制富文本</span></button>
          <button class="tool-button wide" id="copyInline" type="button"><i data-lucide="code-xml"></i><span>复制 inline HTML</span></button>
          <button class="tool-button wide" id="exportHtml" type="button"><i data-lucide="folder-down"></i><span>导出 HTML 到 Downloads</span></button>
          <button class="tool-button wide" id="exportAssets" type="button"><i data-lucide="download"></i><span>导出 article.assets.json</span></button>
        </div>
        <div class="image-list" id="imageList"></div>
        <div class="warnings" id="warnings"></div>
      </aside>
    </section>
    <div class="shortcut-overlay" id="shortcutOverlay" hidden>
      <section class="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcutTitle">
        <div class="shortcut-head">
          <h2 id="shortcutTitle">Markdown 快捷键</h2>
          <button class="icon-button" id="closeShortcuts" type="button" title="关闭" aria-label="关闭">
            <i data-lucide="x"></i>
          </button>
        </div>
        <dl class="shortcut-list">
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>S</kbd></dt><dd>保存</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>B</kbd></dt><dd>加粗</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>I</kbd></dt><dd>斜体</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>K</kbd></dt><dd>链接</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>\`</kbd></dt><dd>行内代码</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>Shift</kbd><kbd>X</kbd></dt><dd>删除线</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>Alt</kbd><kbd>1/2/3</kbd></dt><dd>标题</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>Shift</kbd><kbd>.</kbd></dt><dd>引用</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>Shift</kbd><kbd>7</kbd></dt><dd>有序列表</dd></div>
          <div><dt><kbd>Ctrl/Cmd</kbd><kbd>Shift</kbd><kbd>8</kbd></dt><dd>无序列表</dd></div>
          <div><dt><kbd>Tab</kbd></dt><dd>缩进</dd></div>
          <div><dt><kbd>Shift</kbd><kbd>Tab</kbd></dt><dd>反缩进</dd></div>
        </dl>
      </section>
    </div>
  </main>
`;

createIcons({ icons });
document.documentElement.dataset.theme = state.uiTheme;

const markdownInput = getElement<HTMLTextAreaElement>("markdownInput");
const markdownHighlight = getElement<HTMLElement>("markdownHighlight");
const markdownMirror = getElement("markdownMirror");
const markdownFileInput = getElement<HTMLInputElement>("markdownFileInput");
const folderInput = getElement<HTMLInputElement>("folderInput");
const articleFileSelect = getElement<HTMLSelectElement>("articleFileSelect");
const sourcePane = getElement("sourcePane");
const assetsPane = getElement("assetsPane");
const workspace = document.querySelector<HTMLElement>(".workspace")!;

getElement("openMarkdown").addEventListener("click", () => void pickFile());
getElement("openFolder").addEventListener("click", () => void pickFolder());
getElement("loadExample").addEventListener("click", loadExample);
getElement("showShortcuts").addEventListener("click", showShortcuts);
getElement("closeShortcuts").addEventListener("click", hideShortcuts);
getElement("shortcutOverlay").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    hideShortcuts();
  }
});
getElement("copyInline").addEventListener("click", copyInlineHtml);
getElement("copyRich").addEventListener("click", copyRichText);
getElement("exportAssets").addEventListener("click", exportAssets);
getElement("exportHtml").addEventListener("click", () => void exportHtml());
getElement("reloadPreview").addEventListener("click", () => void reloadPreview());
getElement("uiThemeButton").addEventListener("click", toggleUiTheme);
getElement("toggleSourcePane").addEventListener("click", toggleSourcePane);
getElement("toggleOutputPane").addEventListener("click", toggleOutputPane);
getElement("saveStatus").addEventListener("click", () => void authorizeSave());
sourcePane.addEventListener("dragenter", handleSourceDragEnter);
sourcePane.addEventListener("dragover", handleSourceDragOver);
sourcePane.addEventListener("dragleave", handleSourceDragLeave);
sourcePane.addEventListener("drop", handleSourceDrop);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !getElement("shortcutOverlay").hidden) {
    hideShortcuts();
  }
});

markdownInput.addEventListener("input", () => {
  state.markdown = markdownInput.value;
  markdownDirty = true;
  scheduleHighlight();
  scheduleConvert();
  scheduleSave();
});

markdownInput.addEventListener("scroll", () => {
  syncHighlightScroll();
  if (performance.now() - lastProgrammaticSourceScroll >= SYNC_GUARD_MS) {
    syncPreviewFromSource();
  }
}, { passive: true });
markdownInput.addEventListener("keydown", handleMarkdownKeydown);

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

  clearSaveHandles();
  await importFiles([await encodeFile(file, file.name)], file.name);
  markdownFileInput.value = "";
});

folderInput.addEventListener("change", async () => {
  const files = [...(folderInput.files ?? [])];
  if (files.length === 0) {
    return;
  }

  clearSaveHandles();
  await importFiles(await Promise.all(files.map((file) => encodeFile(file, filePath(file)))));
  folderInput.value = "";
});

articleFileSelect.addEventListener("change", async () => {
  selectArticleFile(articleFileSelect.value);
  state.assets = null;
  assetsDirty = false;
  renderMeta();
  await updateActiveFileHandle();
  scheduleConvert(0);
});

getElement("themeSelect").addEventListener("change", (event) => {
  state.theme = (event.target as HTMLSelectElement).value;
  localStorage.setItem("md2html-theme", state.theme);
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
renderOutputPane();
initResizers();
void initialize();

async function initialize(): Promise<void> {
  await loadThemes();
  await loadExample();
}

function scheduleConvert(delay = 300): void {
  window.clearTimeout(convertTimer);
  convertTimer = window.setTimeout(convertNow, delay);
}

async function reloadPreview(): Promise<void> {
  const button = getElement<HTMLButtonElement>("reloadPreview");
  button.disabled = true;
  window.clearTimeout(convertTimer);
  window.clearTimeout(saveTimer);
  showStatus("重新加载中…");

  try {
    const currentPath = state.inputFilePath;
    await loadThemes();

    if (activeDirHandle) {
      await importFiles(await readDirectoryHandles(activeDirHandle), currentPath, { convert: false });
      await updateActiveFileHandle();
      markdownDirty = false;
      assetsDirty = false;
      await renderSaveStatus();
    } else if (activeFileHandle) {
      const file = await activeFileHandle.getFile();
      await importFiles([await encodeFile(file, file.name)], file.name, { convert: false });
      markdownDirty = false;
      assetsDirty = false;
      await renderSaveStatus();
    } else {
      // File inputs and browser drops do not expose a reusable disk handle; in that case
      // reload means re-reading theme CSS and re-rendering the current in-memory files.
      state.assets = null;
    }

    previewThemeKey = "";
    if (await convertNow()) {
      showStatus(activeDirHandle || activeFileHandle ? "已重新加载文件和 CSS" : "已重新加载 CSS");
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
  }
}

/** 打开单个 Markdown 文件,保留句柄用于自动保存(单文件模式下无法读取同级图片)。 */
async function pickFile(): Promise<void> {
  if (!window.showOpenFilePicker) {
    markdownFileInput.click();
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }]
    });
    const file = await handle.getFile();
    if (!isMarkdownPath(file.name)) {
      showStatus("请选择 Markdown 文件（.md 或 .markdown）", true);
      return;
    }

    activeFileHandle = handle;
    activeDirHandle = null;
    await ensureWritePermission(handle);
    await importFiles([await encodeFile(file, file.name)], file.name);
    renderSaveStatus();
  } catch (error) {
    if (!isAbortError(error)) {
      showStatus(error instanceof Error ? error.message : String(error), true);
    }
  }
}

/** 打开目录,加载其中所有文件(含同级图片),并保留目录句柄用于自动保存。 */
async function pickFolder(): Promise<void> {
  if (!window.showDirectoryPicker) {
    folderInput.click();
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    activeDirHandle = dirHandle;
    activeFileHandle = null;
    await ensureWritePermission(dirHandle);
    await importFiles(await readDirectoryHandles(dirHandle));
    await updateActiveFileHandle();
    renderSaveStatus();
  } catch (error) {
    if (!isAbortError(error)) {
      showStatus(error instanceof Error ? error.message : String(error), true);
    }
  }
}

/** 递归读取目录下所有文件为已编码文件列表(路径相对该目录,便于相对路径解析)。 */
async function readDirectoryHandles(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ""
): Promise<EncodedFile[]> {
  const result: EncodedFile[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      result.push(await encodeFile(file, relPath));
    } else if (entry.kind === "directory") {
      result.push(...await readDirectoryHandles(entry as FileSystemDirectoryHandle, relPath));
    }
  }
  return result;
}

/** 根据当前选中 Markdown 的相对路径,在已打开目录中解析其可写句柄。 */
async function updateActiveFileHandle(): Promise<void> {
  if (!activeDirHandle) {
    return;
  }

  try {
    // 目录已具备读写权限时,其内文件句柄可直接写入,无需再单独请求权限
    // (读取全部文件后再 requestPermission 会脱离用户激活上下文而失败)
    activeFileHandle = await resolveFileHandle(activeDirHandle, state.inputFilePath);
  } catch {
    activeFileHandle = null;
  }
  renderSaveStatus();
}

async function resolveFileHandle(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> {
  const segments = relativePath.split("/").filter(Boolean);
  let dir = dirHandle;
  for (let i = 0; i < segments.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(segments[i]);
  }
  return dir.getFileHandle(segments[segments.length - 1]);
}

/** 请求读写权限;失败时返回 false,保存功能将不可用但不阻塞打开。 */
async function ensureWritePermission(handle: FileSystemHandle): Promise<boolean> {
  if (typeof handle.requestPermission !== "function") {
    return true;
  }
  const opts = { mode: "readwrite" as const };
  try {
    if ((await handle.queryPermission?.(opts)) === "granted") {
      return true;
    }
    // requestPermission 需用户激活上下文;拖拽等非激活场景会抛 SecurityError,这里降级为 false,
    // 由 saveStatus 的「点击授权」按钮在 click 激活下重新请求。
    const result = await handle.requestPermission(opts);
    return result === "granted";
  } catch {
    return false;
  }
}

/** 查询句柄是否已具备写权限(不弹框)。 */
async function hasWritePermission(handle: FileSystemHandle): Promise<boolean> {
  if (typeof handle.queryPermission !== "function") {
    return true;
  }
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

function clearSaveHandles(): void {
  activeFileHandle = null;
  activeDirHandle = null;
  markdownDirty = false;
  assetsDirty = false;
  window.clearTimeout(saveTimer);
  renderSaveStatus();
}

/** 正文或图片宽度改动后,5 秒无后续改动则自动写回已打开的文件。 */
function scheduleSave(): void {
  if (!activeFileHandle && !activeDirHandle) {
    return;
  }
  if (!markdownDirty && !assetsDirty) {
    return;
  }
  setSaveStatus("未保存…", "idle");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 5000);
}

async function saveNow(): Promise<void> {
  const fileHandle = markdownDirty ? activeFileHandle : null;
  const dirHandle = assetsDirty ? activeDirHandle : null;
  const assetsToSave = state.assets;
  if (!fileHandle && !(dirHandle && assetsToSave)) {
    return;
  }

  // 定时器回调无用户激活,createWritable 会因请求权限抛 SecurityError;先校验权限,不足则提示授权。
  const permissionHandle = fileHandle ?? dirHandle;
  if (permissionHandle && !(await hasWritePermission(permissionHandle))) {
    setSaveStatus("点击授权自动保存", "needs-permission");
    return;
  }

  try {
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(state.markdown);
      await writable.close();
      markdownDirty = false;
    }
    if (dirHandle && assetsToSave) {
      await writeAssetsFile(dirHandle, assetsToSave);
      assetsDirty = false;
    }
    setSaveStatus("已保存", "saved");
  } catch (error) {
    setSaveStatus("保存失败", "error");
    console.error("Auto save failed:", error);
  }
}

/** 计算与输入 markdown 同级、同名的 assets 配置文件相对路径(如 sub/article.md → sub/article.assets.json)。 */
function assetsRelativePath(): string {
  const inputPath = state.inputFilePath.replace(/\\/g, "/");
  const slash = inputPath.lastIndexOf("/");
  const dot = inputPath.lastIndexOf(".");
  const base = dot > slash ? inputPath.slice(0, dot) : inputPath;
  return `${base}.assets.json`;
}

/** 在已打开目录中解析(必要时创建)assets 配置文件的可写句柄。 */
async function resolveAssetsFileHandle(
  dirHandle: FileSystemDirectoryHandle
): Promise<FileSystemFileHandle> {
  const segments = assetsRelativePath().split("/").filter(Boolean);
  let dir = dirHandle;
  for (let i = 0; i < segments.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(segments[i]);
  }
  return dir.getFileHandle(segments[segments.length - 1], { create: true });
}

/** 把当前 assets 配置写回源目录的 article.assets.json,供下次打开时复用。 */
async function writeAssetsFile(
  dirHandle: FileSystemDirectoryHandle,
  assets: ArticleAssets
): Promise<void> {
  const handle = await resolveAssetsFileHandle(dirHandle);
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(assets, null, 2));
  await writable.close();
}

async function renderSaveStatus(): Promise<void> {
  if (!activeFileHandle) {
    if (!fsAccessSupported) {
      setSaveStatus("当前浏览器不支持自动保存,请用 Chrome/Edge", "idle");
    } else {
      setSaveStatus("", "idle");
    }
    return;
  }
  if (await hasWritePermission(activeFileHandle)) {
    setSaveStatus("就绪", "idle");
  } else {
    setSaveStatus("点击授权自动保存", "needs-permission");
  }
}

function setSaveStatus(text: string, kind: "idle" | "saving" | "saved" | "error" | "needs-permission"): void {
  const el = getElement("saveStatus");
  el.textContent = text;
  el.className = `save-status is-${kind}`;
}

/** 点击状态条授权:在 click 激活下请求写权限,成功后立即保存当前待写内容。 */
async function authorizeSave(): Promise<void> {
  if (!getElement("saveStatus").classList.contains("is-needs-permission")) {
    return;
  }
  const handle = activeFileHandle ?? activeDirHandle;
  if (!handle) {
    return;
  }
  if (await ensureWritePermission(handle)) {
    await saveNow();
  }
}

function handleMarkdownKeydown(event: KeyboardEvent): void {
  if (event.isComposing) {
    return;
  }

  const hasCommandModifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (event.key === "Tab") {
    event.preventDefault();
    indentSelectedLines(event.shiftKey ? "out" : "in");
    return;
  }

  if (!hasCommandModifier) {
    return;
  }

  if (!event.altKey && !event.shiftKey && key === "s") {
    event.preventDefault();
    void saveFromShortcut();
    return;
  }

  if (!event.altKey && !event.shiftKey && key === "b") {
    event.preventDefault();
    wrapSelection("**", "**", "加粗文本");
    return;
  }

  if (!event.altKey && !event.shiftKey && key === "i") {
    event.preventDefault();
    wrapSelection("*", "*", "斜体文本");
    return;
  }

  if (!event.altKey && !event.shiftKey && key === "k") {
    event.preventDefault();
    insertMarkdownLink();
    return;
  }

  if (!event.altKey && !event.shiftKey && event.key === "`") {
    event.preventDefault();
    wrapSelection("`", "`", "code");
    return;
  }

  if (!event.altKey && event.shiftKey && key === "x") {
    event.preventDefault();
    wrapSelection("~~", "~~", "删除线文本");
    return;
  }

  if (!event.altKey && event.shiftKey && event.code === "Period") {
    event.preventDefault();
    toggleLinePrefix("> ");
    return;
  }

  if (event.altKey && !event.shiftKey && /^[1-3]$/.test(event.key)) {
    event.preventDefault();
    toggleHeading(Number(event.key));
    return;
  }

  if (!event.altKey && event.shiftKey && event.code === "Digit7") {
    event.preventDefault();
    toggleOrderedList();
    return;
  }

  if (!event.altKey && event.shiftKey && event.code === "Digit8") {
    event.preventDefault();
    toggleLinePrefix("- ");
  }
}

async function saveFromShortcut(): Promise<void> {
  window.clearTimeout(saveTimer);
  if (!activeFileHandle && !activeDirHandle) {
    showStatus("请先用「文件」或「目录」打开源文件后保存", true);
    return;
  }

  if (!markdownDirty && !assetsDirty) {
    setSaveStatus("已保存", "saved");
    return;
  }

  setSaveStatus("保存中…", "saving");
  await saveNow();
}

function commitMarkdownEdit(value: string, selectionStart: number, selectionEnd = selectionStart): void {
  const previous = markdownInput.value;
  if (previous === value) {
    markdownInput.setSelectionRange(selectionStart, selectionEnd);
    return;
  }

  const scrollTop = markdownInput.scrollTop;
  const scrollLeft = markdownInput.scrollLeft;
  const diff = findTextReplacement(previous, value);
  markdownInput.focus();
  markdownInput.setSelectionRange(diff.start, diff.end);

  const inserted = document.execCommand?.("insertText", false, diff.text) ?? false;
  if (inserted) {
    state.markdown = markdownInput.value;
    markdownDirty = true;
    markdownInput.setSelectionRange(selectionStart, selectionEnd);
    markdownInput.scrollTop = scrollTop;
    markdownInput.scrollLeft = scrollLeft;
    scheduleHighlight();
    scheduleConvert();
    scheduleSave();
    return;
  }

  markdownInput.value = value;
  state.markdown = value;
  markdownDirty = true;
  markdownInput.setSelectionRange(selectionStart, selectionEnd);
  markdownInput.scrollTop = scrollTop;
  markdownInput.scrollLeft = scrollLeft;
  markdownInput.focus();
  scheduleHighlight();
  scheduleConvert();
  scheduleSave();
}

function findTextReplacement(previous: string, next: string): { start: number; end: number; text: string } {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1;
  }

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    end: previousEnd,
    text: next.slice(start, nextEnd)
  };
}

function wrapSelection(prefix: string, suffix: string, placeholder: string): void {
  const value = markdownInput.value;
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const selected = value.slice(start, end);

  const selectedHasExactWrapper = selected.startsWith(prefix)
    && selected.endsWith(suffix)
    && (prefix !== "*" || (!selected.startsWith("**") && !selected.endsWith("**")));
  if (selected && selectedHasExactWrapper) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length);
    commitMarkdownEdit(
      `${value.slice(0, start)}${inner}${value.slice(end)}`,
      start,
      start + inner.length
    );
    return;
  }

  if (
    start >= prefix.length
    && value.slice(start - prefix.length, start) === prefix
    && value.slice(end, end + suffix.length) === suffix
  ) {
    commitMarkdownEdit(
      `${value.slice(0, start - prefix.length)}${selected}${value.slice(end + suffix.length)}`,
      start - prefix.length,
      end - prefix.length
    );
    return;
  }

  const body = selected || placeholder;
  commitMarkdownEdit(
    `${value.slice(0, start)}${prefix}${body}${suffix}${value.slice(end)}`,
    start + prefix.length,
    start + prefix.length + body.length
  );
}

function insertMarkdownLink(): void {
  const value = markdownInput.value;
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const selected = value.slice(start, end);
  const label = selected || "链接文本";
  const url = /^https?:\/\//i.test(selected) ? selected : "https://";
  const next = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  commitMarkdownEdit(
    `${value.slice(0, start)}${next}${value.slice(end)}`,
    urlStart,
    urlStart + url.length
  );
}

function toggleHeading(level: number): void {
  const hashes = "#".repeat(level);
  transformSelectedLines((lines) => {
    const headingPattern = /^\s{0,3}(#{1,6})\s+/;
    const contentLines = lines.filter((line) => line.trim().length > 0);
    const shouldRemove = contentLines.length > 0
      && contentLines.every((line) => headingPattern.exec(line)?.[1].length === level);

    return lines.map((line) => {
      if (!line.trim()) {
        return shouldRemove ? line : `${hashes} `;
      }
      const withoutHeading = line.replace(headingPattern, "");
      return shouldRemove ? withoutHeading : `${hashes} ${withoutHeading}`;
    });
  });
}

function toggleLinePrefix(prefix: string): void {
  transformSelectedLines((lines) => {
    const contentLines = lines.filter((line) => line.trim().length > 0);
    const shouldRemove = contentLines.length > 0
      && contentLines.every((line) => line.startsWith(prefix));

    return lines.map((line) => {
      if (!line.trim()) {
        return line;
      }
      return shouldRemove ? line.slice(prefix.length) : `${prefix}${line}`;
    });
  });
}

function toggleOrderedList(): void {
  const orderedPattern = /^(\s*)\d+\.\s+/;
  transformSelectedLines((lines) => {
    const contentLines = lines.filter((line) => line.trim().length > 0);
    const shouldRemove = contentLines.length > 0
      && contentLines.every((line) => orderedPattern.test(line));
    let index = 1;

    return lines.map((line) => {
      if (!line.trim()) {
        return line;
      }
      if (shouldRemove) {
        return line.replace(orderedPattern, "$1");
      }
      return `${index++}. ${line}`;
    });
  });
}

function indentSelectedLines(direction: "in" | "out"): void {
  transformSelectedLines((lines) => lines.map((line) => {
    if (direction === "in") {
      return `  ${line}`;
    }
    return line.startsWith("  ") ? line.slice(2) : line.replace(/^\t/, "");
  }));
}

function transformSelectedLines(transform: (lines: string[]) => string[]): void {
  const value = markdownInput.value;
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const endForLine = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextLineBreak = value.indexOf("\n", endForLine);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const block = value.slice(lineStart, lineEnd);
  const nextBlock = transform(block.split("\n")).join("\n");

  commitMarkdownEdit(
    `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`,
    lineStart,
    lineStart + nextBlock.length
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** 用 rAF 合并连续输入,避免每次按键都重建高亮叠加层。 */
function scheduleHighlight(): void {
  if (highlightRaf) {
    return;
  }
  highlightRaf = window.requestAnimationFrame(() => {
    highlightRaf = 0;
    renderHighlight();
  });
}

/** 重建高亮叠加层内容、更新 mirror 并同步滚动位置。 */
function renderHighlight(): void {
  markdownHighlight.innerHTML = highlightMarkdown(markdownInput.value);
  updateMirror();
  syncHighlightScroll();
}

function syncHighlightScroll(): void {
  markdownHighlight.scrollTop = markdownInput.scrollTop;
  markdownHighlight.scrollLeft = markdownInput.scrollLeft;
}

// ---------------------------------------------------------------------------
// 联动滚动 — 基于 mirror div 实现源码行号 ↔ 像素偏移的精确映射，
// 结合预览 iframe 中的 data-source-line 属性做到块级对齐。
// ---------------------------------------------------------------------------

/** 用 markdown 文本更新 mirror div，每行包裹在带 data-line 属性的 span 中。 */
function updateMirror(): void {
  const lines = markdownInput.value.split("\n");
  markdownMirror.innerHTML = lines
    .map((line, i) => `<span data-line="${i + 1}">${escapeHtml(line)}</span>`)
    .join("<br>");
}

/** 查询 mirror div，返回第 line 行首个字符的像素偏移（1-based）。 */
function lineToPixel(line: number): number {
  const marker = markdownMirror.querySelector(`[data-line="${line}"]`);
  if (marker instanceof HTMLElement) {
    return marker.offsetTop;
  }
  // 如果指定行不存在，用最后一行
  const last = markdownMirror.lastElementChild;
  if (last instanceof HTMLElement) {
    return last.offsetTop + last.offsetHeight;
  }
  return 0;
}

/** 根据像素偏移，二分查找最近的源码行号（offsetTop 随行号单调递增）。 */
function pixelToLine(pixel: number): number {
  const markers = markdownMirror.querySelectorAll<HTMLElement>("[data-line]");
  if (markers.length === 0) {
    return 1;
  }
  let lo = 0;
  let hi = markers.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (markers[mid].offsetTop <= pixel) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return parseInt(markers[lo].dataset.line ?? "1", 10);
}

/** 遍历预览 iframe，收集所有带 data-source-line 的块级元素作为滚动锚点。 */
function collectPreviewAnchors(): void {
  previewAnchors = [];
  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  const doc = previewFrame.contentDocument;
  if (!doc) {
    return;
  }
  const elements = doc.querySelectorAll<HTMLElement>("[data-source-line]");
  for (const el of elements) {
    const line = parseInt(el.dataset.sourceLine ?? "0", 10);
    if (line > 0) {
      previewAnchors.push({ el, line });
    }
  }
}

/** 找到预览视口顶部可见的第一个锚点。 */
function findPreviewAnchorAtTop(): PreviewAnchor | null {
  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  const doc = previewFrame.contentDocument;
  if (!doc) {
    return null;
  }
  for (const anchor of previewAnchors) {
    const rect = anchor.el.getBoundingClientRect();
    if (rect.bottom > 0) {
      return anchor;
    }
  }
  return null;
}

/**
 * 找到预览中与目标源码行最接近的锚点。
 * 返回 line ≤ targetLine 的最近锚点（该行所在的块），
 * 无匹配时回退到首个 block。
 */
function findNearestAnchor(targetLine: number): PreviewAnchor | null {
  let best: PreviewAnchor | null = null;
  for (const anchor of previewAnchors) {
    if (anchor.line <= targetLine) {
      best = anchor;
    } else {
      break;
    }
  }
  return best ?? previewAnchors[0] ?? null;
}

/**
 * rAF 驱动的 lerp 动画：逐帧将预览平滑滚动到 previewScrollTarget。
 * 衰减系数动态调整 —— 距离远时步长大（快），靠近目标时步长小（慢），
 * 实现 ease-out 过渡效果。
 */
function animatePreviewScroll(): void {
  if (previewScrollTarget === null) {
    previewScrollRaf = 0;
    return;
  }

  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  const win = previewFrame.contentWindow;
  if (!win) {
    previewScrollRaf = 0;
    return;
  }

  const current = win.scrollY;
  const diff = previewScrollTarget - current;

  if (Math.abs(diff) < 1) {
    lastProgrammaticPreviewScroll = performance.now();
    win.scrollTo({ top: previewScrollTarget, behavior: "instant" as ScrollBehavior });
    previewScrollTarget = null;
    previewScrollRaf = 0;
    return;
  }

  // 衰减系数 0.12–0.5，距离越远越快
  const factor = Math.min(0.5, Math.max(0.12, Math.abs(diff) / 800));
  lastProgrammaticPreviewScroll = performance.now();
  win.scrollTo({ top: Math.round(current + diff * factor), behavior: "instant" as ScrollBehavior });

  previewScrollRaf = requestAnimationFrame(animatePreviewScroll);
}

/** textarea 滚动时，驱动预览平滑跟随。 */
function syncPreviewFromSource(): void {
  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  const doc = previewFrame.contentDocument;
  const win = previewFrame.contentWindow;
  if (!doc || !win || previewAnchors.length === 0) {
    return;
  }

  const sourceLine = pixelToLine(markdownInput.scrollTop);
  const anchor = findNearestAnchor(sourceLine);
  if (anchor) {
    const rect = anchor.el.getBoundingClientRect();
    previewScrollTarget = win.scrollY + rect.top - ANCHOR_OFFSET;
  } else {
    const ratio = markdownInput.scrollTop / Math.max(1, markdownInput.scrollHeight - markdownInput.clientHeight);
    previewScrollTarget = ratio * Math.max(1, doc.documentElement.scrollHeight - win.innerHeight);
  }

  if (!previewScrollRaf) {
    previewScrollRaf = requestAnimationFrame(animatePreviewScroll);
  }
}

/** 预览滚动时，驱动 textarea 跟随。 */
function syncSourceFromPreview(): void {
  const anchor = findPreviewAnchorAtTop();
  if (anchor) {
    const pixel = lineToPixel(anchor.line);
    lastProgrammaticSourceScroll = performance.now();
    markdownInput.scrollTop = Math.max(0, pixel - ANCHOR_OFFSET);
  }
}

async function convertNow(): Promise<boolean> {
  const markdown = state.markdown.trim();
  if (!markdown) {
    showStatus("等待输入");
    return false;
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
      return false;
    }

    state.result = result;
    state.assets = mergeAssets(result.assets, state.assets);
    renderResult();
    showStatus("已转换");
    return true;
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
    return false;
  }
}

async function loadThemes(): Promise<void> {
  const response = await fetch("/api/themes");
  const { themes } = await response.json() as { themes: string[] };
  const ordered = orderThemes(themes);
  const themeSelect = getElement<HTMLSelectElement>("themeSelect");
  themeSelect.innerHTML = ordered.map((theme) => `<option value="${escapeAttr(theme)}">${escapeHtml(theme)}</option>`).join("");
  const persisted = readTheme();
  state.theme = ordered.includes(persisted) ? persisted : (ordered[0] ?? "jugg-clean-v4");
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
  clearSaveHandles();
  markdownInput.value = state.markdown;
  renderArticleSelect();
  renderMeta();
  renderHighlight();
  scheduleConvert(0);
}

function renderResult(): void {
  const result = state.result;
  if (!result) {
    return;
  }

  renderPreview(result);
  renderPreviewShell();
  renderMeta();
  renderImages();
  renderWarnings();
}

let previewThemeKey = "";

/** 预览 iframe 滚动事件监听状态：记录当前绑定的 iframe，避免重复绑定。 */
let boundPreviewFrame: HTMLIFrameElement | null = null;

function bindPreviewScroll(): void {
  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  if (boundPreviewFrame === previewFrame) {
    return;
  }
  // 移除旧的监听
  if (boundPreviewFrame?.contentWindow) {
    boundPreviewFrame.contentWindow.removeEventListener("scroll", onPreviewScroll);
  }
  boundPreviewFrame = previewFrame;
  previewFrame.addEventListener("load", () => {
    const win = previewFrame.contentWindow;
    if (win) {
      win.addEventListener("scroll", onPreviewScroll, { passive: true });

      // 用户开始手动滚动/触摸预览 → 立即取消 rAF 动画
      const cancelAnimation = () => {
        if (previewScrollRaf) {
          cancelAnimationFrame(previewScrollRaf);
          previewScrollRaf = 0;
          previewScrollTarget = null;
        }
      };
      win.addEventListener("wheel", cancelAnimation, { passive: true });
      win.addEventListener("touchstart", cancelAnimation, { passive: true });
    }
    collectPreviewAnchors();
  });
}

function onPreviewScroll(): void {
  if (performance.now() - lastProgrammaticPreviewScroll >= SYNC_GUARD_MS) {
    syncSourceFromPreview();
  }
}

/**
 * 渲染预览 iframe。首次或跨主题时整文档写入一次;之后只增量替换 <article> 与 <style>,
 * 避免每次输入都整页重载导致的白屏闪烁。
 */
function renderPreview(result: ConvertResponse): void {
  const previewFrame = getElement<HTMLIFrameElement>("previewFrame");
  const doc = previewFrame.contentDocument;
  const themeKey = state.theme;
  // srcdoc 文档基址为 about:srcdoc,需注入 <base> 让 res/xxx.png 解析到服务端输出目录
  const baseHref = new URL(result.imageBaseUrl, window.location.origin).href;

  if (!doc || !doc.body || previewThemeKey !== themeKey) {
    previewAnchors = [];
    bindPreviewScroll();
    previewFrame.srcdoc = injectBaseHref(result.html, baseHref);
    previewThemeKey = themeKey;
    return;
  }

  ensureBaseHref(doc, baseHref);
  const parsed = new DOMParser().parseFromString(result.html, "text/html");
  const styleText = parsed.querySelector("style")?.textContent ?? "";
  const styleEl = doc.querySelector("style");
  if (styleEl && styleEl.textContent !== styleText) {
    styleEl.textContent = styleText;
  }

  const newArticle = parsed.querySelector(".md2html-article");
  const oldArticle = doc.querySelector(".md2html-article");
  if (newArticle && oldArticle) {
    oldArticle.replaceWith(doc.importNode(newArticle, true));
  } else {
    doc.body.innerHTML = parsed.body.innerHTML;
  }
  // 增量更新后重新收集锚点
  collectPreviewAnchors();
}

/** 在预览 HTML 的 <head> 注入 <base>,使相对图片路径解析到服务端输出目录。 */
function injectBaseHref(html: string, baseHref: string): string {
  const baseTag = `<base href="${escapeAttr(baseHref)}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => match + baseTag);
  }
  return baseTag + html;
}

function ensureBaseHref(doc: Document, baseHref: string): void {
  let base = doc.querySelector("base");
  if (!base) {
    base = doc.createElement("base");
    doc.head?.prepend(base);
  }
  if (base.getAttribute("href") !== baseHref) {
    base.setAttribute("href", baseHref);
  }
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
      assetsDirty = true;
      scheduleConvert();
      scheduleSave();
    };

    range.addEventListener("input", () => updateWidth(range.value));
    number.addEventListener("change", () => updateWidth(number.value));
  });
}

function renderWarnings(): void {
  const warnings = state.result?.report.warnings ?? [];
  const target = getElement("warnings");
  const missing = state.result?.report.imagesMissing ?? 0;
  const hint = missing > 0 && activeFileHandle && !activeDirHandle
    ? `<p class="hint">本地图片未加载:改用「目录」打开所在文件夹即可显示图片。</p>`
    : "";

  if (warnings.length === 0 && !hint) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = `
    ${hint}
    ${warnings.length ? `<h3>警告</h3>` : ""}
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

function renderOutputPane(): void {
  assetsPane.classList.toggle("is-collapsed", state.outputCollapsed);
  workspace.classList.toggle("output-collapsed", state.outputCollapsed);

  const toggleButton = getElement<HTMLButtonElement>("toggleOutputPane");
  const label = state.outputCollapsed ? "展开输出区" : "收起输出区";
  toggleButton.title = label;
  toggleButton.setAttribute("aria-label", label);
  toggleButton.innerHTML = `<i data-lucide="${state.outputCollapsed ? "panel-right-open" : "panel-right-close"}"></i>`;
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
  renderHighlight();
}

/** 移除 HTML 中的 data-source-line / data-source-line-end 属性，避免污染剪切板。 */
function stripSourceLines(html: string): string {
  return html.replace(/\s*data-source-line(?:-end)?="[^"]*"/g, "");
}

async function copyInlineHtml(): Promise<void> {
  if (!state.result) {
    return;
  }

  await navigator.clipboard.writeText(stripSourceLines(state.result.inlineHtml));
  showStatus("inline HTML 已复制");
}

async function copyRichText(): Promise<void> {
  if (!state.result) {
    return;
  }

  const html = absolutizeImageSources(stripSourceLines(state.result.inlineHtml), state.result.imageBaseUrl);
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

/** 调用服务端把当前转换结果(index.html + res 资源)导出到 ~/Downloads 下一个文件夹。 */
async function exportHtml(): Promise<void> {
  const result = state.result;
  if (!result) {
    showStatus("请先转换后再导出", true);
    return;
  }

  showStatus("导出中…");
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: result.jobId, articleName: state.articleName })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    const { path: exportPath } = await response.json() as { path: string };
    showStatus(`已导出到 ${exportPath}`);
    void revealInFinder(exportPath);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

/** 调用服务端在 Finder 中打开导出目录。 */
async function revealInFinder(target: string): Promise<void> {
  try {
    await fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target })
    });
  } catch {
    // 打开 Finder 失败不影响导出结果，静默忽略
  }
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
  applyPaneWidths();
}

function toggleOutputPane(): void {
  state.outputCollapsed = !state.outputCollapsed;
  localStorage.setItem("md2html-output-collapsed", String(state.outputCollapsed));
  renderOutputPane();
  applyPaneWidths();
}

function showShortcuts(): void {
  const overlay = getElement("shortcutOverlay");
  overlay.hidden = false;
  getElement<HTMLButtonElement>("closeShortcuts").focus();
}

function hideShortcuts(): void {
  const overlay = getElement("shortcutOverlay");
  overlay.hidden = true;
  getElement<HTMLButtonElement>("showShortcuts").focus();
}

async function handleSourceDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  sourceDragDepth = 0;
  setSourceDragging(false);

  // getAsFileSystemHandle 必须在 drop 事件同步阶段调用,先收集全部 promise 再 await,
  // 拿到可写句柄后才能自动保存;否则回退到仅读取内容(无句柄,无法自动保存)。
  const handles = (await Promise.all(readDropHandlePromises(event.dataTransfer)))
    .filter((handle): handle is FileSystemHandle => Boolean(handle));

  if (handles.length === 0) {
    const files = await readDroppedFiles(event.dataTransfer);
    if (files.length === 0) {
      showStatus("未找到可导入文件", true);
      return;
    }
    clearSaveHandles();
    await importFiles(files);
    return;
  }

  clearSaveHandles();
  const dirHandle = handles.find((handle): handle is FileSystemDirectoryHandle => handle.kind === "directory");
  if (dirHandle) {
    activeDirHandle = dirHandle;
    activeFileHandle = null;
    await ensureWritePermission(dirHandle);
    await importFiles(await readDirectoryHandles(dirHandle));
    await updateActiveFileHandle();
  } else {
    const fileHandle = handles.find((handle): handle is FileSystemFileHandle => handle.kind === "file");
    if (!fileHandle) {
      return;
    }
    activeFileHandle = fileHandle;
    activeDirHandle = null;
    await ensureWritePermission(fileHandle);
    const file = await fileHandle.getFile();
    await importFiles([await encodeFile(file, file.name)], file.name);
  }
  renderSaveStatus();
}

/** 同步收集拖拽项的文件系统句柄 promise(必须在事件处理同步阶段调用,否则 DataTransfer 失效)。 */
function readDropHandlePromises(dataTransfer: DataTransfer | null): Promise<FileSystemHandle | null>[] {
  if (!dataTransfer) {
    return [];
  }
  return [...dataTransfer.items]
    .map((item) => item.getAsFileSystemHandle?.())
    .filter((promise): promise is Promise<FileSystemHandle | null> => Boolean(promise));
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

async function importFiles(
  files: EncodedFile[],
  preferredPath?: string,
  options: { convert?: boolean } = {}
): Promise<void> {
  state.files = files;
  const markdownFiles = state.files.filter((file) => isMarkdownPath(file.path));
  // 选 article.md;否则取路径层数最浅(顶层)的 md,避免误选子目录(如 old/)中的文档
  const shallowest = markdownFiles
    .slice()
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
  const selected = preferredPath
    ? markdownFiles.find((file) => file.path === preferredPath)
    : markdownFiles.find((file) => file.path.endsWith("/article.md"))
      ?? shallowest
      ?? markdownFiles[0];
  if (!selected) {
    showStatus("目录中没有 Markdown", true);
    return;
  }

  selectArticleFile(selected.path);
  state.assets = null;
  renderArticleSelect();
  renderMeta();
  if (options.convert !== false) {
    scheduleConvert(0);
  }
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

function readOutputCollapsed(): boolean {
  return localStorage.getItem("md2html-output-collapsed") === "true";
}

function readTheme(): string {
  return localStorage.getItem("md2html-theme") ?? "";
}

/** 主题排序:v4 优先,其次 v3/v2/v1,其余按名称升序,保证下拉顺序稳定。 */
function orderThemes(themes: string[]): string[] {
  const preferred = ["jugg-clean-v4", "jugg-clean-v3", "jugg-clean-v2", "jugg-clean-v1"];
  const ranked = preferred.filter((name) => themes.includes(name));
  const rest = themes
    .filter((name) => !preferred.includes(name))
    .sort((a, b) => a.localeCompare(b));
  return [...ranked, ...rest];
}

/** 初始化三栏宽度调节器,并恢复上次保存的宽度。 */
function initResizers(): void {
  document.querySelectorAll<HTMLElement>(".resizer").forEach((resizer) => {
    resizer.addEventListener("mousedown", startResize);
  });
  applyPaneWidths();
  window.addEventListener("resize", () => applyPaneWidths());
}

function applyPaneWidths(): void {
  const available = workspace.clientWidth - RESIZER_WIDTH * 2;
  if (available <= 0) {
    return;
  }

  // 有任一面板收起时清除像素宽度,让 CSS grid 的 fr 默认值均分剩余空间
  if (state.sourceCollapsed || state.outputCollapsed) {
    workspace.style.removeProperty("--col-source");
    workspace.style.removeProperty("--col-output");
    return;
  }

  const stored = readPaneWidths();
  let source = stored?.source ?? defaultSourceWidth(available);
  let output = stored?.output ?? defaultOutputWidth(available);

  source = clamp(source, MIN_SOURCE_WIDTH, available - MIN_PREVIEW_WIDTH - output);
  output = clamp(output, MIN_OUTPUT_WIDTH, available - MIN_PREVIEW_WIDTH - source);

  workspace.style.setProperty("--col-source", `${source}px`);
  workspace.style.setProperty("--col-output", `${output}px`);
}

function startResize(event: MouseEvent): void {
  const resizer = event.currentTarget as HTMLElement;
  const target = resizer.dataset.resize as "source" | "output";
  if (!target) {
    return;
  }

  const sourceWidth = paneRenderedWidth(sourcePane);
  const outputWidth = paneRenderedWidth(assetsPane);
  activeResize = {
    target,
    startX: event.clientX,
    startWidth: target === "source" ? sourceWidth : outputWidth,
    otherWidth: target === "source" ? outputWidth : sourceWidth
  };

  resizer.classList.add("is-dragging");
  document.body.classList.add("is-resizing");
  window.addEventListener("mousemove", onResizeMove);
  window.addEventListener("mouseup", endResize);
  event.preventDefault();
}

function onResizeMove(event: MouseEvent): void {
  if (!activeResize) {
    return;
  }
  const delta = event.clientX - activeResize.startX;
  const available = workspace.clientWidth - RESIZER_WIDTH * 2;
  const maxWidth = available - MIN_PREVIEW_WIDTH - activeResize.otherWidth;
  const min = activeResize.target === "source" ? MIN_SOURCE_WIDTH : MIN_OUTPUT_WIDTH;
  // 源栏在最左,分隔条位置随源栏宽变化,取 +delta;
  // 输出栏在最右,分隔条位置 = 总宽 - 输出宽,故取 -delta 才能跟随鼠标。
  const sign = activeResize.target === "source" ? 1 : -1;
  const width = clamp(activeResize.startWidth + sign * delta, min, maxWidth);
  workspace.style.setProperty(
    activeResize.target === "source" ? "--col-source" : "--col-output",
    `${width}px`
  );
}

function endResize(): void {
  if (!activeResize) {
    return;
  }
  activeResize = null;
  document.querySelectorAll(".resizer.is-dragging").forEach((el) => el.classList.remove("is-dragging"));
  document.body.classList.remove("is-resizing");
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", endResize);
  persistPaneWidths();
}

function persistPaneWidths(): void {
  localStorage.setItem(
    "md2html-pane-widths",
    JSON.stringify({ source: paneRenderedWidth(sourcePane), output: paneRenderedWidth(assetsPane) })
  );
}

function paneRenderedWidth(element: HTMLElement): number {
  return Math.round(element.getBoundingClientRect().width);
}

function defaultSourceWidth(available: number): number {
  return Math.round((available * 0.92) / 3.13);
}

function defaultOutputWidth(available: number): number {
  return Math.round((available * 0.86) / 3.13);
}

function readPaneWidths(): { source: number; output: number } | null {
  try {
    const raw = localStorage.getItem("md2html-pane-widths");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { source?: unknown; output?: unknown };
    if (typeof parsed.source !== "number" || typeof parsed.output !== "number") {
      return null;
    }
    return { source: parsed.source, output: parsed.output };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
