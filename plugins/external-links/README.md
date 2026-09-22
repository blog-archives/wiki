# External Links

为文章中的链接添加可配置的外观、网站图标和箭头：外链默认使用带图标的胶囊标签，站内链接共用同一胶囊外观但不显示图标和箭头。保留原有文字、强调格式、地址与打开方式。不提供外部网页预览。

## 配置

在 `quartz.config.yaml` 中放在 `crawl-links` 后面，修改后重新构建：

```yaml
- source: "./plugins/external-links"
  enabled: true
  order: 61
  options:
    style: pill
    standaloneStyle: inline
    logo: favicon
    arrow: diagonal
    showDomain: false
    internal: true
    internalLogo: note
    icons: {}
```

| 选项              | 可选值                                                                    | 默认值     |
| ----------------- | ------------------------------------------------------------------------- | ---------- |
| `style`           | `text` 图标文字、`tag` 轻标签、`pill` 胶囊                                | `pill`     |
| `standaloneStyle` | `inline` 跟随正文样式、`card` 两行卡片、`list` 来源行                     | `inline`   |
| `logo`            | `favicon` 网站图标、`globe` 统一地球、`none` 隐藏                         | `favicon`  |
| `arrow`           | `diagonal` 斜向箭头、`external` 方框外跳、`chevron` 右尖括号、`none` 隐藏 | `diagonal` |
| `showDomain`      | 是否在正文链接中显示域名                                                  | `false`    |
| `internal`        | 是否用同一外观装饰站内链接                                                | `true`     |
| `internalLogo`    | 站内链接前的线性符号：`note` 文档、`link` 链接、`hash` 标签、`none` 隐藏  | `note`     |
| `icons`           | 精确主机名到图标地址的映射                                                | `{}`       |

`internalLogo` 也可直接给 SVG path 数据（或 path 数据数组），符号随 `currentColor` 取色、统一 1.6 描边，例如：

```yaml
internalLogo:
  - M12 3v18
  - M3 12h18
```

`standaloneStyle` 只影响一个段落中唯一的 **外链**（允许周围空白），卡片与来源行始终显示域名；站内链接和普通句子、表格中的链接一样使用 `style`。不依赖页面标题抓取，也不自动生成摘要。

例如改用轻标签、方框箭头，并将独立链接渲染成卡片：

```yaml
style: tag
standaloneStyle: card
arrow: external
```

## 网站图标

默认在浏览器中懒加载目标站点的 `/favicon.ico`，不经过第三方图标服务，不发送页面 referrer，也不在构建时抓取网站。没有有效图标时显示地球；禁用 JavaScript 时也保留地球图标。浏览器仍会向目标网站发送图标请求，若不希望这些请求，使用 `logo: globe` 或 `logo: none`。

部分网站的图标不在 `/favicon.ico`，可指定准确的图片地址或本站静态资源：

```yaml
icons:
  github.com: https://github.githubassets.com/favicons/favicon.svg
  example.com: /static/example-icon.svg
```

映射按精确主机名匹配；子域名需单独配置。支持 HTTP(S) 和以单个 `/` 开头的本站路径。图标资源由浏览器按服务器缓存策略缓存，插件不下载或持久化图标。品牌图标保留原色。

## 范围与外观

处理文章内容中的外链和站内链接。外链默认使用 `style` 指定的胶囊，带网站图标和箭头；站内链接沿用同一 `style` 胶囊，前方用 `internalLogo` 指定的线性符号（默认文档图标），不显示域名和外跳箭头。跳过同站绝对地址、锚点、邮箱、电话、代码和图片链接。页眉、侧栏与页脚保持原样。文章中的原始 HTML 链接可加 `class="external-plain"` 跳过本插件。行内的 text / tag / pill 链接在左右各留约一个空格的间隔（`--el-inline-space`），避免与相邻汉字或标点贴在一起；独占段落的卡片和来源行不受影响。

沿用 Quartz 的字体、颜色和浅深色主题；胶囊中的长文字允许换行，避免移动端溢出。

细调圆角、间距、边框等外观可编辑本插件的 `styles.css`，无需改动 Quartz。`--el-radius` 控制轻标签圆角，`--el-gap` 控制行内图标间距，`--el-inline-space` 控制链接与正文的前后间隔；胶囊和卡片有各自的圆角规则。

## 验证

```sh
node --test plugins/external-links/index.test.js
node quartz/bootstrap-cli.mjs build -d wiki -o public
```

插件无新增依赖。链接装饰在构建期完成；仅 `favicon` 模式注入一小段客户端脚本，用于图标加载与失败处理，兼容 Quartz 的页面导航。
