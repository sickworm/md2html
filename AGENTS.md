# md2html 工具维护指南

## 项目定位

本目录是 Markdown 转 HTML 的发布工具，目标平台包括公众号、KM、乐乎等。实现应尽量兼容原生 Markdown：增强能力优先通过 `> [!note]`、`<details>`、特殊引用块、普通标题等可降级语法表达。

## 目录结构

- `packages/core/`：转换核心，负责 Markdown 解析、增强块转换、平台适配、主题内联和资源复制。
- `packages/cli/`：命令行入口，只处理参数解析、错误输出和调用 core。
- `packages/web/`：本地 Web UI 入口，只处理页面交互和本地 API，不承载转换逻辑。
- `themes/jugg-clean/`：默认主题配置和 CSS。
- `examples/basic/`：基础 fixture，包含示例 Markdown、图片和图片尺寸配置。
- `scripts/`：示例素材生成和 fixture 验证脚本。

## 常用命令

请在 `tools/md2html` 目录执行：

- `npm install`：安装依赖。
- `npm run build`：编译 `packages/core` 和 `packages/cli`。
- `npm run dev:web`：启动本地 Web UI。
- `npm run verify:fixtures`：构建并验证基础转换、资源复制、安全 HTML 清理、严格模式等行为。
- `node packages/cli/dist/index.js examples/basic/article.md --platform wechat --theme jugg-clean -o dist/basic`：手动运行 CLI 示例。

转换 Jugg 文章时，源文件通常在本目录上两级之外，例如：

```bash
node packages/cli/dist/index.js "../../Jugg.md/7.Jugg2.X/文章.md" --platform wechat --theme jugg-clean -o dist/article
```

## 编码规范

- 使用 TypeScript ESM，保持函数短小、结构直接。
- 优先复用现有 `remark`、`rehype`、`unified` 插件链，不自行实现完整 Markdown 解析器。
- `core` 不依赖 CLI；CLI 不承载转换逻辑。
- 新增公共类型、公共类或复杂核心方法时，添加简短介绍性注释。
- 保持平台适配代码可读，避免把公众号、KM、乐乎规则混在同一个大函数里。
- 重要变更需要记录到本文件，包含变更内容、入口命令和关键限制，方便后续 agent 延续上下文。

## 验证要求

当前以 fixture 验证为主。修改转换逻辑、资源复制、平台适配或主题内联后，至少运行：

```bash
npm run build
npm run verify:fixtures
```

新增回归场景优先扩展 `scripts/verify-fixtures.mjs` 和 `examples/basic/`。不要在文章仓库里创建测试产物。

## Web UI 约定

- Web UI 作为独立 `packages/web` workspace 维护。
- Web UI 不直接 shell 调用 CLI，必须复用 `packages/core` 的 API，让 CLI 和 Web UI 成为两个薄入口，共享同一套转换能力。
- Web UI 只做本地转换、预览和导出，不实现云端、上传、登录能力。

## 已记录的重要变更

### 2026-06-29 Web UI Markdown 面板交互

- Markdown 左侧面板支持拖入单个 Markdown 文件、多个文件或文件夹；文件夹拖入通过浏览器 `webkitGetAsEntry` 递归读取，保留相对路径用于图片资源解析。
- 单文件选择器不再使用系统 `accept` 扩展名过滤，避免 macOS 把 `Jugg.md` 这类目录当成可选文件；选中后由前端校验 `.md`、`.markdown`。
- Markdown 左侧面板新增收起/展开按钮，状态保存在 `localStorage` 的 `md2html-source-collapsed`。
- Web UI 默认示例内容改为 `examples/style-demo/article.md`，接口为 `/api/examples/style-demo`。
- Web UI 在开发模式下把 Vite HMR 绑定到当前 Express HTTP server，避免多个实例分别占用页面端口时抢默认 HMR 端口导致页面反复刷新。
- 验证入口：

```bash
npm run build
npm run verify:fixtures
```

### 2026-06-28 样式验证 Demo

- 新增 `examples/style-demo/article.md`，集中覆盖普通 Markdown、GFM 表格/任务列表/删除线、四种 callout、`<details>`、本地图片、HTML 图片、轻量安全 HTML 和 `--toc` 目录。
- 新增 `examples/style-demo/article.assets.json`，用于验证前两张本地图片的展示宽度配置。
- `examples/style-demo/res/sample.png` 是 Web UI 默认示例依赖的自包含图片资源，不要改回跨目录引用。
- 验证入口：

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean --toc -o dist/style-demo
```

- 关键限制：`wechat`、`km`、`lexiang` 平台会把 `<details>` 降级为静态区块，并产生 `details-downgraded` warning；这是预期行为。

### 2026-06-28 双击命令脚本

- 新增 `md2html-web.command`，macOS 双击后自动选择可用端口、启动 Web UI 并打开浏览器。
- 新增 `md2html-cli.command`，macOS 双击后提示输入或拖入 Markdown 文件路径，按 `wechat`、`jugg-clean`、`--toc` 转换到 `dist/<文章名>/` 并打开预览 HTML。
- 两个脚本都会在缺少 `node_modules` 时自动执行 `npm install`；CLI 脚本会在缺少 `packages/cli/dist/index.js` 时自动执行 `npm run build`。

### 2026-06-28 md2html Web UI

- 新增 `packages/web` workspace，提供本地 Web UI。
- 根目录新增 `npm run dev:web`，用于启动 Web UI。
- Web UI 通过本地 Express/Vite server 直接复用 `@md2html/core` 的 `convertMarkdown`，不调用 CLI。
- 支持 Markdown 输入、单个 Markdown 文件选择、文章目录选择、平台预览、主题切换、图片宽度调整、复制 inline HTML、复制富文本、导出 `article.assets.json`。
- Web UI 只做本地转换和预览，不包含云端、上传、登录能力。
- 默认端口是 4576；如果被占用，可用 `PORT=4577 npm run dev:web` 启动。

## Agent 专用说明

- 默认只在 `tools/md2html` 内修改工具代码。
- 不要改写 `../../Jugg.md` 下的文章草稿，除非用户明确要求。
- 不要删除未跟踪素材或历史发布产物。
- 调整主题时保留普通 Markdown 可读性，不把内容语义绑定到纯样式技巧上。
