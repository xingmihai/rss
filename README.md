# RSS 聚合器 (Cloudflare Worker)

一个基于 Cloudflare Worker 的轻量级 RSS 聚合服务，支持多源 RSS 订阅、自动合并排序，并通过 JSON API 返回最新的文章列表。

## 功能特性

- **多源聚合**：支持配置多个 RSS 源 URL，并行获取数据
- **容错处理**：单个 RSS 源失败不会影响其他源的正常获取
- **自动排序**：按发布日期自动排序，最新的文章在前
- **内容清理**：自动去除 HTML 标签，解码 HTML 实体，清理多余空白
- **跨域支持**：内置 CORS 响应头，支持前端直接调用
- **轻量高效**：基于 Cloudflare Worker Edge 计算，低延迟全球访问

## 部署方式

### Cloudflare Workers 自动部署

[![rss](https://deploy.workers.cloudflare.com/button)](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/deploy-to-workers&repository=https://github.com/xingmihai/rss)

### 2. 配置环境变量

在 Worker 的 **Settings** → **Variables** 中添加环境变量：

| 变量名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `RSS_URLS` | 字符串 | 多个 RSS 源 URL，用逗号分隔 | `https://example.com/rss.xml,https://blog.example.com/feed.xml` |
| `ALLOWED_ORIGINS` | 白名单 | 多个白名单用逗号分隔 | `https://www.xmhai.cn` |
> **注意**：如果不配置 `RSS_URLS`，将使用默认的 RSS 源：
> - `https://www.xmhai.cn/rss.xml`

### 3. 部署

点击 **Deploy** 按钮，Worker 将立即上线并可通过分配的 `*.workers.dev` 域名访问。

## API 使用

### 获取文章列表

**请求：**
```http
GET https://your-worker.your-subdomain.workers.dev/
```
> 也可绑定自定义域名

**响应：**
```json
[
  {
    "title": "文章标题",
    "auther": "RSS 源标题",
    "date": "2026-06-13",
    "link": "https://example.com/article",
    "content": "文章摘要内容..."
  }
]
```

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 文章标题 |
| `auther` | string | 来源 RSS 源的标题（作为作者/来源标识） |
| `date` | string | 发布日期，格式为 `YYYY-MM-DD` |
| `link` | string | 文章原文链接 |
| `content` | string | 清理后的文章摘要/描述 |

## 技术细节

### 数据流程

```
请求 → fetchAllRSS() → 并行获取多个 RSS → parseRSS() → 合并排序 → 返回前20篇
```

### 核心函数

| 函数 | 说明 |
|------|------|
| `fetchAllRSS(env)` | 并行获取所有配置的 RSS 源，合并并排序 |
| `fetchAndParseSingleRSS(url)` | 获取单个 RSS 源并解析 |
| `parseRSS(xml)` | 解析 RSS XML，提取 Feed 信息和文章列表 |
| `extractTag(xml, tag)` | 从 XML 中提取指定标签内容 |
| `decodeHtmlEntities(text)` | 解码 HTML 实体（如 `&amp;` → `&`） |
| `cleanContent(desc)` | 清理文章内容，去除 HTML 标签和多余空白 |
| `formatDate(dateStr)` | 格式化日期为 `YYYY-MM-DD` |

### 限制与默认值

- **返回数量**：最多返回最新的 **20 篇** 文章
- **超时**：依赖 Cloudflare Worker 的默认 fetch 超时（约 30 秒）
- **RSS 格式**：支持标准 RSS 2.0 格式（`<channel>` + `<item>` 结构）

## 自定义扩展

### 修改返回数量

编辑 `fetchAllRSS` 函数中的切片参数：

```typescript
return allArticles.slice(0, 50);  // 改为返回 50 篇
```

### 添加更多 RSS 源

直接在 `RSS_URLS` 环境变量中添加，用逗号分隔：

```bash
RSS_URLS=https://a.com/rss.xml,https://b.com/feed.xml,https://c.com/rss
```

### 支持 Atom 格式

如需支持 Atom Feed，可扩展 `parseRSS` 函数，增加对 `<feed>` 和 `<entry>` 标签的解析逻辑。

## 注意事项

1. **RSS 源稳定性**：如果某个 RSS 源长期不可用，建议从 `RSS_URLS` 中移除或替换
2. **内容长度**：`content` 字段为 RSS 中的 `<description>` 内容，长度取决于 RSS 源的配置
3. **日期解析**：依赖 RSS 源提供的 `<pubDate>` 格式，标准 RSS 日期格式兼容性最佳

## 许可证

MIT License