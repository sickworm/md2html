import type { CalloutConfig } from "./theme-loader.js";

// 从 theme.json 的 callout 配置生成可内联的 CSS。
// 只用可内联属性(无 ::before / var(--) / @media),与 theme.css 的约束保持一致,
// 生成结果追加到主题 CSS 后由 juice 内联到元素 style 上。
export function generateCalloutCss(callout: CalloutConfig): string {
  const radius = callout.radius ?? 8;

  // 结构规则:卡片相对定位,圆徽绝对定位悬挂在左上外沿,颜色由各 type 规则补齐
  // 顶部内距留足(22px)给悬挂圆徽腾出呼吸空间,避免首行文字贴着圆徽
  const base = [
    `.md2html-callout{position:relative;margin:22px 0 18px;padding:18px 18px 16px;border-radius:${radius}px;font-size:15px;color:#2D3748;}`,
    `.md2html-callout p{margin:0;}`,
    `.md2html-callout p + p{margin-top:8px;}`,
    `.md2html-callout-badge{position:absolute;top:-13px;left:16px;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-style:normal;font-weight:700;font-size:13px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.12);}`
  ];

  const perType = Object.entries(callout.types).flatMap(([type, style]) => [
    `.md2html-callout-${type}{background:${style.background};}`,
    `.md2html-callout-${type} .md2html-callout-badge{background:${style.badge};color:${style.iconColor ?? "#fff"};}`
  ]);

  return "\n" + [...base, ...perType].join("\n") + "\n";
}
