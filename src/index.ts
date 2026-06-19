export interface Env {
  RSS_URLS: string;  // 多个 RSS 源 URL，用逗号分隔
  ALLOWED_ORIGINS?: string;  // 允许访问的域名白名单，用逗号分隔（如 https://www.xmhai.cn,https://example.com）
}

// 文章数据结构
interface Article {
  title: string;
  auther: string;
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
    return handleApi(request, env);
  },
};

// 检查请求来源是否在白名单中
function checkOrigin(request: Request, env: Env): { allowed: boolean; origin: string | null } {
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';

  // 如果没有配置白名单，允许所有来源（兼容原有行为）
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(o => o.length > 0);
  if (allowedOrigins.length === 0) {
    return { allowed: true, origin: '*' };
  }

  // 检查来源是否在白名单中
  const isAllowed = allowedOrigins.some(allowed => {
    // 支持精确匹配或前缀匹配
    if (origin === allowed) return true;
    if (origin.startsWith(allowed)) return true;
    return false;
  });

  return { allowed: isAllowed, origin };
}

// 获取并解析多个 RSS 源
async function fetchAllRSS(env: Env): Promise<Article[]> {
  const rssUrls = (env.RSS_URLS || 'https://www.xmhai.cn/rss.xml')
    .split(',')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  // 并行获取所有 RSS 源
  const promises = rssUrls.map(async (rssUrl) => {
    try {
      const { articles } = await fetchAndParseSingleRSS(rssUrl);
      return articles;
    } catch (error) {
      console.error(`Failed to fetch RSS from ${rssUrl}:`, error);
      return [];  // 单个源失败不影响其他源
    }
  });

  const results = await Promise.all(promises);

  // 合并所有文章并按日期排序（最新的在前），只返回前20篇
  const allArticles = results.flat();
  allArticles.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  return allArticles.slice(0, 20);  // 只返回前20篇
}

// 获取并解析单个 RSS 源
async function fetchAndParseSingleRSS(rssUrl: string): Promise<{ feed: FeedInfo; articles: Article[] }> {
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
      auther: feed.title,
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

// 清理内容文本
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

// 处理 API 请求
async function handleApi(request: Request, env: Env): Promise<Response> {
  // 检查域名白名单
  const { allowed, origin } = checkOrigin(request, env);

  if (!allowed) {
    return jsonResponse({ error: '不允许使用原点' }, 403, null);
  }

  try {
    const articles = await fetchAllRSS(env);
    return jsonResponse(articles, 200, origin);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500, origin);
  }
}

// JSON 响应
function jsonResponse(data: unknown, status = 200, origin: string | null = '*'): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };

  // 设置 CORS：如果有白名单则返回具体域名，否则返回 *
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}
