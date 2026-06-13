/**
 * xmhai-rss-display
 * Cloudflare Worker - 获取并展示 https://www.xmhai.cn/rss.xml 的文章
 */

export interface Env {
  RSS_URL: string;
}

// 修改后的文章数据结构，匹配新格式
interface Article {
  title: string;
  auther: string;  // 注意：原文是 author，但这里按你的要求保留 auther
  date: string;
  link: string;
  content: string;
}

// RSS 源信息
interface FeedInfo {
  title: string;
  link: string;
  description: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API 端点：返回 JSON 数据
    if (url.pathname === '/api/articles') {
      return handleApi(env);
    }

    // 默认：返回渲染的 HTML 页面
    return handlePage(env);
  },
};

// 获取并解析 RSS
async function fetchAndParseRSS(env: Env): Promise<{ feed: FeedInfo; articles: Article[] }> {
  const rssUrl = env.RSS_URL || 'https://www.xmhai.cn/rss.xml';

  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare Worker RSS Reader)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  return parseRSS(xmlText);
}

// 解析 RSS XML
function parseRSS(xml: string): { feed: FeedInfo; articles: Article[] } {
  // 提取 channel 信息
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/);
  if (!channelMatch) {
    throw new Error('Invalid RSS format: no channel found');
  }

  const channel = channelMatch[1];

  // 先解析 feed 信息
  const feed: FeedInfo = {
    title: extractTag(channel, 'title') || '未知标题',
    link: extractTag(channel, 'link') || '#',
    description: extractTag(channel, 'description') || '',
  };

  // 解析文章列表
  const articles: Article[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(channel)) !== null) {
    const item = match[1];
    const title = extractTag(item, 'title') || '无标题';
    const link = extractTag(item, 'link') || '#';
    const content = extractTag(item, 'description') || '';
    const pubDate = extractTag(item, 'pubDate') || '';

    articles.push({
      title: decodeHtmlEntities(title),
      auther: feed.title,  // 直接使用 feed 的 title
      date: formatDate(pubDate),
      link,
      content: cleanContent(content),
    });
  }

  return { feed, articles };
}

// 从 XML 中提取标签内容
function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*(?:<(?!\/${tag}>)[^<]*)*)<\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

// 解码 HTML 实体
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
  };
  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}

// 清理内容文本（保留更多内容，不截断）
function cleanContent(desc: string): string {
  // 移除 HTML 标签
  let text = desc.replace(/<[^>]*>/g, '');
  // 解码实体
  text = decodeHtmlEntities(text);
  // 去除多余空白
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// 格式化日期
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];  // 只返回 YYYY-MM-DD 格式
  } catch {
    return dateStr;
  }
}

// 处理 API 请求 - 返回新的 JSON 格式
async function handleApi(env: Env): Promise<Response> {
  try {
    const data = await fetchAndParseRSS(env);
    // 直接返回 articles 数组，不再包裹 feed 信息
    return jsonResponse(data.articles);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

// 处理页面请求
async function handlePage(env: Env): Promise<Response> {
  try {
    const { feed, articles } = await fetchAndParseRSS(env);
    const html = renderHTML(feed, articles, env.RSS_URL || 'https://www.xmhai.cn/rss.xml');
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    const html = renderError((error as Error).message);
    return new Response(html, {
      status: 500,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
}

// JSON 响应
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// 渲染 HTML 页面（保持不变）
function renderHTML(feed: FeedInfo, articles: Article[], rssUrl: string): string {
  const articleCards = articles
    .map(
      (article, index) => `
    <article class="article-card" style="--delay: ${index * 0.1}s">
      <div class="article-content">
        <h2 class="article-title">
          <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(article.title)}
          </a>
        </h2>
        <time class="article-date">${escapeHtml(article.date)}</time>
        ${article.auther ? `<span class="article-author">作者：${escapeHtml(article.auther)}</span>` : ''}
        <p class="article-desc">${escapeHtml(article.content.substring(0, 200))}...</p>
        <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer" class="read-more">
          阅读全文
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </a>
      </div>
    </article>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(feed.title)} - RSS 文章列表</title>
  <link rel="alternate" type="application/rss+xml" href="${escapeHtml(rssUrl)}" title="${escapeHtml(feed.title)}">
  <style>
    :root {
      --bg: #0f172a;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --text: #f1f5f9;
      --text-secondary: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --border: #334155;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
        'Microsoft YaHei', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    /* 头部 */
    .header {
      text-align: center;
      padding: 3rem 0 2rem;
      position: relative;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 4px;
      background: linear-gradient(90deg, var(--accent), #a855f7);
      border-radius: 2px;
    }

    .header h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, var(--accent), #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      max-width: 500px;
      margin: 0 auto 1rem;
    }

    .header-meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .rss-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s;
    }

    .rss-badge:hover {
      background: rgba(56, 189, 248, 0.25);
    }

    /* 统计 */
    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 2rem;
      padding: 1rem;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* 文章卡片 */
    .articles {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .article-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: all 0.3s ease;
      opacity: 0;
      animation: fadeInUp 0.5s ease forwards;
      animation-delay: var(--delay, 0s);
    }

    .article-card:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: var(--shadow), 0 0 20px rgba(56, 189, 248, 0.1);
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .article-title {
      font-size: 1.15rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .article-title a {
      color: var(--text);
      text-decoration: none;
      transition: color 0.2s;
    }

    .article-title a:hover {
      color: var(--accent);
    }

    .article-date {
      display: block;
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
    }

    .article-desc {
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 1rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .read-more {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s;
    }

    .read-more:hover {
      color: var(--accent-hover);
      gap: 0.5rem;
    }

    /* 底部 */
    .footer {
      text-align: center;
      padding: 3rem 0 1rem;
      color: var(--text-secondary);
      font-size: 0.8rem;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    /* 响应式 */
    @media (max-width: 640px) {
      .header h1 {
        font-size: 1.5rem;
      }

      .article-card {
        padding: 1.25rem;
      }

      .stats {
        gap: 1.5rem;
      }
    }

    /* 滚动条美化 */
    ::-webkit-scrollbar {
      width: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--bg-hover);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>${escapeHtml(feed.title)}</h1>
      <p>${escapeHtml(feed.description)}</p>
      <div class="header-meta">
        <a href="${escapeHtml(feed.link)}" target="_blank" rel="noopener noreferrer" class="rss-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 11a9 9 0 0 1 9 9"></path>
            <path d="M4 4a16 16 0 0 1 16 16"></path>
            <circle cx="5" cy="19" r="1"></circle>
          </svg>
          访问博客
        </a>
        <a href="${escapeHtml(rssUrl)}" target="_blank" rel="noopener noreferrer" class="rss-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 11a9 9 0 0 1 9 9"></path>
            <path d="M4 4a16 16 0 0 1 16 16"></path>
            <circle cx="5" cy="19" r="1"></circle>
          </svg>
          RSS 源
        </a>
      </div>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${articles.length}</div>
        <div class="stat-label">篇文章</div>
      </div>
      <div class="stat">
        <div class="stat-value">${articles[0]?.date || '-'}</div>
        <div class="stat-label">最新更新</div>
      </div>
    </div>

    <main class="articles">
      ${articleCards}
    </main>

    <footer class="footer">
      <p>内容由 <a href="${escapeHtml(feed.link)}" target="_blank">${escapeHtml(feed.title)}</a> RSS 源自动同步</p>
      <p style="margin-top: 0.5rem; opacity: 0.6">Powered by Cloudflare Workers</p>
    </footer>
  </div>
</body>
</html>`;
}

// 渲染错误页面
function renderError(message: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>加载失败 - RSS Reader</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .error-container {
      text-align: center;
      padding: 2rem;
    }
    .error-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      color: #38bdf8;
    }
    p {
      color: #94a3b8;
      max-width: 400px;
      margin: 0 auto;
    }
    .retry-btn {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.6rem 1.5rem;
      background: #38bdf8;
      color: #0f172a;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h1>加载 RSS 源失败</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/" class="retry-btn">重试</a>
  </div>
</body>
</html>`;
}

// HTML 转义
function escapeHtml(text: string): string {
  const div = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' } as const;
  return text.replace(/[<>'"&]/g, (c) => div[c as keyof typeof div] || c);
}
