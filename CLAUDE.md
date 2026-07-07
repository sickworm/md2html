# md2html 工具维护指南

## 项目定位

本目录是 Markdown 转 HTML 的发布工具，目标平台包括公众号、KM、乐乎等。实现应尽量兼容原生 Markdown：增强能力优先通过 `> [!note]`、`<details>`、特殊引用块、普通标题等可降级语法表达。

因为是发布到其他平台，所以不设置文章背景色，只使用静态样式，导出必须为 inline html。

## 目录结构

- `packages/core/`：转换核心，负责 Markdown 解析、增强块转换、平台适配、主题内联和资源复制。
- `packages/cli/`：命令行入口，只处理参数解析、错误输出和调用 core。
- `packages/web/`：本地 Web UI 入口，只处理页面交互和本地 API，不承载转换逻辑。
- `themes/`：主题配置和 CSS，默认主题为 `jugg-clean-v2`。
- `examples/basic/`：基础 fixture，包含示例 Markdown、图片和图片尺寸配置。
- `scripts/`：示例素材生成和 fixture 验证脚本。

## 常用命令

请在 `tools/md2html` 目录执行：

- `npm install`：安装依赖。
- `npm run build`：编译 `packages/core` 和 `packages/cli`。
- `npm run dev:web`：启动本地 Web UI。
- `npm run verify:fixtures`：构建并验证基础转换、资源复制、安全 HTML 清理、严格模式等行为。
- `node packages/cli/dist/index.js examples/basic/article.md --platform wechat --theme jugg-clean-v2 -o dist/basic`：手动运行 CLI 示例。

转换 Jugg 文章时，源文件通常在本目录上两级之外，例如：

```bash
node packages/cli/dist/index.js "../../Jugg.md/7.Jugg2.X/文章.md" --platform wechat --theme jugg-clean-v2 -o dist/article
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

### 2026-07-06 Web UI Markdown 光标插入偏移修复

- Markdown 编辑区采用透明 `textarea` 叠加 `pre.markdown-highlight` 的结构；高亮层必须只改颜色，不改字体度量。`packages/web/src/styles.css` 已让 `markdown-highlight`、`markdown-mirror`、`#markdownInput` 统一 `font-weight: 400`、`font-style: normal`、`font-variant-ligatures: none`、换行规则和 `tab-size`。
- `.md-heading`、`.md-bold`、`.md-italic`、`.md-lang` 不再使用 `font-weight` / `font-style` 做视觉强调，避免中文场景中用户看到的字符位置和真实 textarea selection 偏一格，例如点击“累计|编译”后实际插入到“累”和“计”之间。
- 第二行/自动折行偏移通常来自两层排版宽度不一致，尤其是 textarea 垂直滚动条占用内容宽度而高亮层没有占用。`packages/web/src/main.ts` 会测量 `markdownInput.offsetWidth - markdownInput.clientWidth` 写入 `--markdown-scrollbar-width`，高亮层和 mirror 右侧让出同等宽度；三层行高统一为整数 `22px`，减少小数行高在多行场景下的累计误差。
- 验证入口:

```bash
npm run build
```

### 2026-07-04 jugg-clean-v4 strong 轻强调修正

- v4 的 `.md2html-article strong` 使用 `color: #0a6b4a` + `font-weight: 500` 做轻强调，不再用 `text-shadow` 或描边模拟半字重；原因是 Windows 中文字体在 text-shadow 下容易出现边缘发毛/锯齿。
- 中文系统字体常把 500/600 映射到有限字重档位，纯粹调 `550`、`575` 通常不会产生稳定差异；当前方案用更深的文字型强调色补足可见度，避免 600 过重。
- 验证入口:

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean-v4 --toc -o dist/v4-heading-demo
```

### 2026-07-04 Web UI Markdown 编辑区快捷键

- Markdown `textarea` 新增常用编辑快捷键，入口在 `packages/web/src/main.ts` 的 `handleMarkdownKeydown`：`Ctrl/Cmd+S` 立即保存、`Ctrl/Cmd+B` 加粗、`Ctrl/Cmd+I` 斜体、`Ctrl/Cmd+K` 链接、`Ctrl/Cmd+\`` 行内代码、`Ctrl/Cmd+Shift+X` 删除线、`Ctrl/Cmd+Alt+1/2/3` 标题、`Ctrl/Cmd+Shift+.` 引用、`Ctrl/Cmd+Shift+7/8` 有序/无序列表、`Tab/Shift+Tab` 缩进/反缩进。
- Markdown 面板标题栏新增「快捷键」按钮，点击打开快捷键引导弹窗，支持点遮罩或 Esc 关闭。
- 快捷键只改 Web UI 输入区文本，不进入 `packages/core`；程序化编辑会复用现有高亮、预览转换和自动保存流程。`Ctrl/Cmd+S` 走已有 File System Access 写回逻辑，未通过浏览器文件/目录句柄打开时只提示先打开源文件。文本编辑优先用 `document.execCommand("insertText")` 进入浏览器原生撤销栈，确保 `Ctrl/Cmd+Z` 可回退快捷键操作。
- 验证入口:

```bash
npm run build
```

### 2026-07-04 jugg-clean-v4 标题层级重整(H1/H3 保留签名装饰 + H4/H5 真实前缀)

- 保留 v4 当前方向里的 **H1 亮绿下划线** 和 **H3 左侧亮绿线**，但重排 H2/H3 强弱关系：H2 改为更强的章节分隔(23px / 更大上间距 / 深灰标题色 / 灰色长下划线)，H3 保留左绿线但降为 2px、缩短上下间距并使用偏灰标题色，避免 H3 装饰强度倒挂 H2。
- 新增主题配置 `headingPrefixes`，v4 配置为 `h4: "#"`、`h5: "·"`；实现见 `packages/core/src/markdown/rehype-heading-prefixes.ts`。前缀注入为真实 `<span class="md2html-heading-prefix">` 文本节点，而不是 CSS `::before`，确保 Web 预览和公众号/KM/乐乎 inline HTML 导出一致。
- H4/H5 区分策略：H4 保持 17px / 700 / 深灰并用亮绿 `#` 作为局部主题标记；H5 降到 15px / 600 / 浅灰并用灰色 `·` 作为子点标记。该方案参考成熟文档/出版排版中“小层级用文字权重 + 轻符号，而非继续堆边框”的做法。
- 验证入口:

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean-v4 --toc -o dist/v4-heading-demo
npm run verify:fixtures
```

### 2026-07-03 新增 jugg-clean-v3 主题(重排绿色层级)

- 复制 `jugg-clean-v2` 为 `themes/jugg-clean-v3`,只重排「绿色层级」,让每个绿只承担一种角色,解决 v2 里 H1/H2/H3/加粗全同色、亮绿链接白底不达标的问题:
  - **深墨绿 `#0D3225`**:只给结构标题 H1/H2/H3(近黑锚点)。
  - **深翠绿 `#0a6b4a`**:白底上的「文字型强调」——链接 / H4 / 加粗 / 行内代码文字,对比度 ~5.3:1 达 WCAG AA。
  - **亮翠绿 `#10B981`**:只做装饰——强调条 / 列表点 / 引用边 / H1 主标签下边框。
- 五处针对性改动:**H1** 放大到 30px / 700 / 字距 -0.03em + 2px 亮绿满宽下边框(主标签签名);**H4** 改为大写 eyebrow 小标签(深翠绿 / 13.5px / letter-spacing 0.06em / uppercase),不再与正文加粗混淆;**链接** 亮绿→深翠绿(下边框同步);**行内代码** 底色 `#F0FDF4`→`#E9F7F0`、文字→深翠绿;**加粗** 近黑墨绿→深翠绿,正文里「发绿高亮」与近黑标题分层。
- 主题按目录名动态扫描加载(`theme-loader.ts` / `server.ts` 的 `/api/themes`),新增目录即自动出现在 Web UI;`packages/web/src/main.ts` 的 `orderThemes` 已把 v3 排在首位并默认选中。默认主题仍是 v2(CLI `--theme` 默认值未改),v2 保持不动。
- 验证入口:

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean-v3 --toc -o dist/v3-demo
npm run verify:fixtures
```

### 2026-07-02 jugg-clean 深绿双层配色 + 数据指标卡

- 配色改为**深绿双层**:深墨绿基调 `#0D3225`(H1/H2/H3 标题、加粗、summary),亮绿强调 `#10B981`(标题左强调条、H3 左边框、列表标记、引用边、数据卡数字),链接深绿 `#0a6b4a`(白底长文可读,不用参考稿的高亮绿以保证对比度)。行内代码/表头/toc/callout-tip/details 同步改到该色系。
- 新增**数据指标卡**语法:`> [!METRICS]` 引用块,其后每行 `数值 | 标签`,渲染成横向数据看板(大数字 + 灰标签)。见 `packages/core/src/markdown/remark-callouts.ts` 的 `applyMetrics`,用 mdast `hName/hProperties/hChildren` 直接输出 hast `table.md2html-metrics`。**用 table 布局而非 flex**,兼容公众号等不支持 flex 的环境;降级到不支持环境时就是普通引用块,逐行 `数值 | 标签` 仍可读。
- 设计依据:参考稿的高级感来自"深基调 + 亮强调"双层色与数据看板卡,二者已采纳;其 PPT 深色页/调色板/营销头属展示面板元素,不适用于通用文章主题,未采纳。
- 验证入口:

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean --toc -o dist/style-demo
npm run verify:fixtures
```

### 2026-07-02 jugg-clean 视觉增强(代码块顶栏 / details / 换行修复)

- 代码块加顶栏:三个 mac 风格圆点 + 语言标签(TypeScript、Bash 等真实文本,公众号可见)。实现关键:顶栏包裹**必须在 Shiki transformer 的 `pre` 钩子内完成**——Shiki 会替换 pre 节点,外部独立 rehype 插件拿不到最终节点(踩坑记录)。见 `packages/core/src/markdown/rehype-code-block-chrome.ts` 的 `createCodeBlockChromeTransformer`,通过 `this.options.lang` 取语言。
- 行内代码换行截断修复:加 `box-decoration-break: clone`(带 `-webkit-` 前缀),跨行时每段保留完整圆角/边框/内边距;并在 `pre code` 内重置该属性。
- Details 折叠块补齐样式:原生 `details`/`summary`(generic 平台)用青绿左标记 + 自定义 ▸/▾ 展开箭头 + 圆角阴影;降级 `md2html-details-fallback`(公众号等)做成同款青绿静态卡片。
- 视觉层次增强:代码块容器、callout、表格、details 加轻微 `box-shadow`;表格改 `border-collapse: separate` + 圆角 + 斑马纹,`overflow: hidden` 裁圆角。
- 代码块结构变化:`pre.shiki` 现被包进 `section.md2html-code-block`,`theme.css` 中容器管圆角/边框/阴影,pre 去掉自身圆角外边距。
- 验证入口:

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean --toc -o dist/style-demo
node packages/cli/dist/index.js examples/style-demo/article.md --platform generic --theme jugg-clean --toc -o dist/style-demo-generic
npm run verify:fixtures
```

### 2026-07-02 jugg-clean 主题重设计 + Shiki 语法高亮

- 重写 `themes/jugg-clean/theme.css`,建立极速青绿(`#0ca678` / 深色 `#087f5b`)辨识度体系:H2 青绿左强调条 + 底部分隔线、H3 青绿左边框、行内代码淡青底青字、引用块青绿调边淡青底、表头淡青底 + 斑马纹、列表标记与链接青绿点缀。
- 关键约束:产物经 juice 内联,`theme.css` 只用可内联属性,**不用伪元素(::before)、CSS 变量、媒体查询**;标题强调条用 `border-left` 而非 `::before` 实现,保证公众号不丢样式。
- 接入 Shiki(`shiki` + `@shikijs/rehype`,主题 `material-theme-palenight`)做代码块语法高亮。Shiki 输出内联颜色 span,juice 原样保留,**公众号/KM/乐乎也带高亮**。仅第二遍正式渲染启用(`renderMarkdownToHtml` 的 `highlight` 开关),第一遍图片收集跳过。代码块背景/配色由 Shiki 承担,`theme.css` 只管间距边框,并重置 `pre code` 避免行内代码青底渗入。
- `remark-callouts.ts` 为四种 callout 注入中文标签行(NOTE→说明、TIP→建议、WARNING→注意、IMPORTANT→重点),内联在正文首行,替代原生全大写英文标记。callout 采用淡底 + 细左色条(方向三),去掉大色块观感。
- `theme.json` 字体栈补齐中文(PingFang SC / Microsoft YaHei)。
- 验证入口:

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean --toc -o dist/style-demo
npm run verify:fixtures
```

- 关键限制:Shiki 首次运行会异步加载语言/主题,`convertMarkdown` 已是 async 无需额外处理。

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

## 改动后是否需要重启

`md2html-web.command` 启动时会自动执行 `npm run build` 完整编译。之后修改代码：

| 改动文件 | 生效方式 |
|----------|----------|
| `packages/web/src/main.ts` | 自动，Vite HMR（浏览器热更新） |
| `packages/web/src/styles.css` | 自动，Vite HMR |
| `packages/web/src/server.ts` | 需重启 `./md2html-web.command` |
| `packages/core/src/*.ts` | 需重启 `./md2html-web.command`（`npm run build` 会编译） |
| `themes/` 下的主题文件 | 需重启 `./md2html-web.command` |

> **结论**：只改 Web UI 前端（main.ts、CSS）不需要重启。改后端（server.ts、core 包、主题）必须重启。
