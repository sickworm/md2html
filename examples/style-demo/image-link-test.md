# 图片角标链接 — 使用说明

图片角标链接是放在图片左上角**上方**的超链接标签，不会遮挡图片内容。

## theme.json 配置

在主题的 `theme.json` 中设置 `imageLinkStyle`，可选值：

| 值 | 名称 | 视觉效果 |
|----|------|---------|
| `pill` | 紧贴上方 | 深翠绿实底药丸，白字，上圆角，紧贴图片顶边 |
| `tab` | 边框 Tab | 白底绿框标签，与图片边框连通如标签页 |
| `card` | 一体化卡片 | 链接栏 + 分隔线 + 图片，同一细边框包裹 |
| `accent` | 左侧绿条 | 3px 亮绿左边框（复刻 H3 签名），透明底 |

不设置 `imageLinkStyle` 时，不会对任何图片添加角标链接。

## Markdown 写法

在图片之前写一行 HTML 注释：

```
<!-- image-link: 标签文字 | 链接地址 -->
![替代文字](图片路径.png)
```

- `| 链接地址` 可选：不提供时标签纯展示，不跳转
- 同时支持 Markdown `![]()` 和 HTML `<img>` 两种图片写法
- 注释和图片之间可以有空行，但不能有其他内容

## 示例

<!-- image-link: Pill风格 | https://example.com/pill -->
![看板截图（Markdown 语法）](sample.png)

<!-- image-link: 纯文字标签（不跳转） -->
<img src="sample.png" alt="看板截图（HTML 语法）" width="700"/>
