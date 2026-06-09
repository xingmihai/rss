# xmhai-rss-display

Cloudflare Worker 项目 - 获取并展示 [星觅海的博客](https://www.xmhai.cn) RSS 文章。

## 功能

- 自动抓取 `https://www.xmhai.cn/rss.xml` 的文章数据
- 渲染为美观的暗色主题 HTML 页面
- 提供 `/api/articles` JSON API 接口
- 响应式设计，支持移动端
- 卡片动画效果

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 本地开发

```bash
npm run dev
```

### 3. 部署到 Cloudflare

```bash
npm run deploy
```

部署后会得到一个 `*.workers.dev` 的域名，访问即可看到文章列表。

## 配置

### 自定义 RSS 源

编辑 `wrangler.toml` 中的 `RSS_URL` 变量：

```toml
[vars]
RSS_URL = "https://your-rss-feed.com/feed.xml"
```

### 绑定自定义域名

取消 `wrangler.toml` 中 `routes` 的注释并修改为你的域名：

```toml
routes = [
  { pattern = "your-domain.com", custom_domain = true }
]
```

## 项目结构

```
xmhai-rss-worker/
├── src/
│   └── index.ts          # Worker 主逻辑
├── package.json
├── wrangler.toml         # Cloudflare 配置
└── README.md
```

## 技术栈

- TypeScript
- Cloudflare Workers
- 原生 Web API (fetch, Response)
- 纯 CSS 样式（无外部依赖）

## 端点

| 路径 | 说明 |
|------|------|
| `/` | HTML 页面，展示文章卡片 |
| `/api/articles` | JSON API，返回文章数据 |
