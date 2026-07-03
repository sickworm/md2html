# md2html 样式验证 Demo

这篇 Markdown 用来集中验证当前 md2html 已支持的排版和增强块。建议分别用 `generic` 和 `wechat` 平台转换，确认原生 `<details>` 与平台降级效果。

## 目录与标题

启用 `--toc` 时，工具会收集 H1、H2、H3 生成文章目录，并为标题补充锚点。

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

## 段落与行内样式

普通正文会保持 Markdown 段落结构。这里包含 **加粗**、*斜体*、***加粗斜体***、~~删除线~~、`inline code`、[普通链接](https://example.com)、自动链接 https://example.com/md2html，以及上标 H<sub>2</sub>O / x<sup>2</sup>。

这一行后面有一个 HTML 换行：<br>换行后的文本仍在同一段语义里。

## 引用块

> 普通引用块适合放摘录、说明或普通备注。
>
> 可以包含 **强调文本** 和 `inline code`。

## Callout 增强块

> [!NOTE]
> NOTE 用于普通提示。它是可降级的 Markdown 引用块语法。

> [!TIP]
> TIP 用于经验、建议或更优操作路径。

> [!WARNING]
> WARNING 用于风险、限制或需要提前确认的事项。

> [!IMPORTANT]
> IMPORTANT 用于必须关注的结论或强约束。

## 数据指标卡

`> [!METRICS]` 后每行写 `数值 | 标签`,渲染成横向数据看板;降级到不支持的环境时仍是普通引用块。

> [!METRICS]
> < 3s | 平均编译耗时
> 36,000+ h | 累计节省等待
> 20+ 人年 | 释放研发工时

## 列表

- 无序列表第一项
- 无序列表第二项
  - 嵌套列表
  - 嵌套列表里的 `inline code`

1. 有序列表第一项
2. 有序列表第二项
3. 有序列表第三项

- [x] 已完成任务
- [ ] 未完成任务

## 代码块

```ts
interface Article {
  title: string;
  platform: "generic" | "wechat" | "km" | "lexiang";
}

const article: Article = {
  title: "md2html 样式验证 Demo",
  platform: "wechat"
};

console.log(article);
```

```bash
npm run build
node packages/cli/dist/index.js examples/style-demo/article.md --platform wechat --theme jugg-clean --toc -o dist/style-demo
```

## 表格

| 能力 | Markdown 写法 | 转换行为 |
| --- | --- | --- |
| GFM 表格 | `| a | b |` | 输出 HTML table |
| 任务列表 | `- [x] item` | 输出 checkbox input |
| 删除线 | `~~text~~` | 输出 del |
| 图片宽度 | Markdown 图片或 HTML 图片 | 复制到 `res/` 并写入宽度 |

## 图片

Markdown 图片会复制到输出目录，并根据图片原始尺寸、主题上限或 assets 配置计算展示宽度。

![Markdown 图片示例](./res/sample.png)

HTML 图片也会被识别，`width` 会作为展示宽度参与转换。

<img src="./res/sample.png" width="240" alt="HTML 图片示例">

## Details 折叠块

<details open>
  <summary>Generic 平台保留折叠行为，公众号/KM/乐乎会降级为静态内容</summary>
  <p>这里是 details 内部正文，可以放普通段落、列表和代码。</p>
  <ul>
    <li>第一条明细</li>
    <li>第二条明细</li>
  </ul>
</details>

## 安全 HTML 白名单

<section title="allowed-section">
  <div class="demo-html-block">
    <span lang="zh-CN">允许的轻量 HTML：section、div、span、strong、em、sub、sup。</span>
    <strong>这些标签会保留。</strong>
  </div>
</section>

---

## 收尾检查

转换后重点检查：

1. 标题、目录、表格和代码块的间距是否正常。
2. 四种 callout 的颜色和边框是否容易区分。
3. 图片是否复制到 `dist/style-demo/res/`，且宽度符合预期。
4. `wechat`、`km`、`lexiang` 平台下 details 是否降级为静态区块。
